from __future__ import annotations

import base64
import binascii
import logging
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ai, imaging
from . import knowledge as kb
from .config import settings
from .db import Analysis, get_session, init_db

logging.basicConfig(level=logging.INFO)
settings.upload_dir.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    ai.start_model_check()  # downloads the open-source model on first run if needed
    yield


app = FastAPI(title="Crop Advisor AI API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


def device(x_device_id: str | None = Header(default=None)) -> str:
    return (x_device_id or "anonymous")[:64]


def serialize(a: Analysis, full: bool = True) -> dict:
    out = {
        "id": a.id, "created_at": a.created_at.isoformat(), "crop": a.crop, "image_url": f"/uploads/{a.image_file}",
        "notes": a.notes, "health_score": a.health_score, "health_status": a.health_status,
        "favorite": a.favorite, "provider": a.provider, "lang": a.lang,
        "summary": a.result.get("summary", ""),
        "top_issue": (a.result.get("issues") or [{}])[0].get("name"),
        "harvest_ready": bool(a.result.get("harvest", {}).get("ready")),
    }
    if full:
        out["result"] = a.result
    return out


def _load(session: Session, analysis_id: str, dev: str) -> Analysis:
    a = session.get(Analysis, analysis_id)
    if not a or a.device_id != dev:
        raise HTTPException(404, "Analysis not found")
    return a


# ------------------------------------------------------------------ routes

@app.get("/health")
def health():
    return {"status": "ok", **ai.status_summary()}


@app.post("/api/ai/recheck")
def recheck_model():
    """Ask the server to look for the model again (e.g. after starting Ollama)."""
    ai.start_model_check()
    return {"status": "checking"}


@app.post("/api/analyze")
async def analyze(
    image: UploadFile = File(...),
    crop: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    lang: str = Form(default="en"),
    session: Session = Depends(get_session),
    dev: str = Depends(device),
):
    data = await image.read()
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Image larger than {settings.max_upload_mb} MB")
    try:
        jpeg, img = imaging.prepare(data)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Could not read the image. Please upload a JPEG, PNG or WebP photo.")
    stats = imaging.colour_stats(img)
    result = ai.analyze(jpeg, stats, crop, notes, lang)
    filename = f"{uuid.uuid4().hex}.jpg"
    (settings.upload_dir / filename).write_bytes(jpeg)
    a = Analysis(
        device_id=dev, crop=result.get("crop") or crop or "Unknown", image_file=filename, notes=notes, lang=lang,
        health_score=int(result.get("health_score", 0)), health_status=result.get("health_status", "healthy"),
        provider=result.get("engine", ai.provider_name()), result=result,
    )
    session.add(a)
    session.commit()
    return serialize(a)


@app.get("/api/analyses")
def list_analyses(favorite: bool | None = None, limit: int = 100, session: Session = Depends(get_session), dev: str = Depends(device)):
    q = select(Analysis).where(Analysis.device_id == dev).order_by(Analysis.created_at.desc()).limit(min(limit, 500))
    if favorite is not None:
        q = q.where(Analysis.favorite == favorite)
    return [serialize(a, full=False) for a in session.scalars(q)]


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: str, session: Session = Depends(get_session), dev: str = Depends(device)):
    return serialize(_load(session, analysis_id, dev))


class FavoriteIn(BaseModel):
    favorite: bool


@app.patch("/api/analyses/{analysis_id}/favorite")
def set_favorite(analysis_id: str, body: FavoriteIn, session: Session = Depends(get_session), dev: str = Depends(device)):
    a = _load(session, analysis_id, dev)
    a.favorite = body.favorite
    session.commit()
    return serialize(a, full=False)


@app.delete("/api/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: str, session: Session = Depends(get_session), dev: str = Depends(device)):
    a = _load(session, analysis_id, dev)
    (settings.upload_dir / a.image_file).unlink(missing_ok=True)
    session.delete(a)
    session.commit()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=60)
    analysis_id: str | None = None
    image_base64: str | None = None
    lang: str = "en"


@app.post("/api/chat")
def chat(body: ChatIn, session: Session = Depends(get_session), dev: str = Depends(device)):
    analysis = _load(session, body.analysis_id, dev).result if body.analysis_id else None
    jpeg = stats = None
    if body.image_base64:
        raw = body.image_base64.split(",", 1)[-1]
        try:
            jpeg, img = imaging.prepare(base64.b64decode(raw))
        except (binascii.Error, UnidentifiedImageError, OSError):
            raise HTTPException(400, "Could not read the attached image")
        stats = imaging.colour_stats(img)
        if analysis is None and not ai.ai_ready():
            # knowledge-base mode: give the reply some image context via colour analysis
            analysis = ai.offline_analysis(stats, None, body.messages[-1].content)
    return ai.chat([m.model_dump() for m in body.messages], analysis, jpeg, body.lang, image_stats=stats)


class FertilizerIn(BaseModel):
    crop: str | None = None
    stage: str | None = None
    analysis_id: str | None = None


@app.post("/api/fertilizer")
def fertilizer(body: FertilizerIn, session: Session = Depends(get_session), dev: str = Depends(device)):
    if body.analysis_id:
        r = _load(session, body.analysis_id, dev).result
        return kb.fertilizer_plan(body.crop or r.get("crop"), body.stage or r.get("growth_stage"),
                                  [i["name"] for i in r.get("issues", [])])
    return kb.fertilizer_plan(body.crop, body.stage)


@app.get("/api/crops")
def crop_list():
    return [{"id": k, "name": v["name"], "days_to_harvest": v["days_to_harvest"], "watering": v["watering"]["summary"]}
            for k, v in kb.crops().items()]


@app.get("/api/guides")
def guide_list(q: str | None = None):
    items = kb.search(q, k=8) if q else kb.guides()
    return [{k: g[k] for k in ("id", "title", "crop", "category")} for g in items]


@app.get("/api/guides/{guide_id}")
def guide_detail(guide_id: str):
    for g in kb.guides():
        if g["id"] == guide_id:
            return g
    raise HTTPException(404, "Guide not found")


@app.get("/api/stats")
def stats(session: Session = Depends(get_session), dev: str = Depends(device)):
    rows = list(session.scalars(select(Analysis).where(Analysis.device_id == dev).order_by(Analysis.created_at)))
    issues = Counter(i["name"].split(" (")[0] for a in rows for i in a.result.get("issues", []))
    return {
        "total": len(rows),
        "healthy": sum(a.health_status == "healthy" for a in rows),
        "with_issues": sum(bool(a.result.get("issues")) for a in rows),
        "favorites": sum(a.favorite for a in rows),
        "avg_health": round(sum(a.health_score for a in rows) / len(rows)) if rows else 0,
        "ready_to_harvest": sum(bool(a.result.get("harvest", {}).get("ready")) for a in rows),
        "by_crop": [{"crop": c, "count": n} for c, n in Counter(a.crop for a in rows).most_common()],
        "by_status": [{"status": s, "count": sum(a.health_status == s for a in rows)} for s in ("healthy", "mild", "moderate", "severe")],
        "top_issues": [{"name": n, "count": c} for n, c in issues.most_common(5)],
        "trend": [{"date": a.created_at.isoformat(), "score": a.health_score, "crop": a.crop} for a in rows[-12:]],
    }
