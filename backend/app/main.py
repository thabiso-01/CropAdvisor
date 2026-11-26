from __future__ import annotations

import base64
import binascii
import logging
import uuid
from collections import Counter
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import UnidentifiedImageError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ai, imaging
from . import knowledge as kb
from .config import settings
from .auth import current_user
from .auth import router as auth_router
from .db import Analysis, User, get_session, init_db
from .ratelimit import client_ip, limiter

logging.basicConfig(level=logging.INFO)
settings.upload_dir.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Crop Advisor AI API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")
app.include_router(auth_router)


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


def _load(session: Session, analysis_id: str, user: User) -> Analysis:
    a = session.get(Analysis, analysis_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Analysis not found")
    return a


# ------------------------------------------------------------------ routes

@app.get("/health")
def health():
    return {"status": "ok", **ai.status_summary()}


# A plain `def` (not `async def`): FastAPI runs it in a worker thread, so a slow AI call
# doesn't freeze the server for everyone else.
@app.post("/api/analyze")
def analyze(
    request: Request,
    image: UploadFile = File(...),
    crop: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    lang: str = Form(default="en"),
    session: Session = Depends(get_session),
    user: User = Depends(current_user),
    x_device_id: str | None = Header(default=None),
):
    data = image.file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Image larger than {settings.max_upload_mb} MB")
    try:
        jpeg, img = imaging.prepare(data)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(400, "Could not read the image. Please upload a JPEG, PNG or WebP photo.")
    limiter.hit([f"analyze:user:{user.id}", f"analyze:ip:{client_ip(request)}"], settings.analyze_per_hour)
    stats = imaging.colour_stats(img)
    # Photos without a plant are turned away before any analysis is run or saved.
    is_plant, seen = ai.check_plant(jpeg, stats)
    if not is_plant:
        raise HTTPException(422, ai.NOT_A_PLANT_MESSAGE + (f" (The photo seems to show: {seen.rstrip('.')}.)" if seen else ""))
    result = ai.analyze(jpeg, stats, crop, notes, lang)
    if not result.get("is_plant", True):
        raise HTTPException(422, ai.NOT_A_PLANT_MESSAGE)
    filename = f"{uuid.uuid4().hex}.jpg"
    (settings.upload_dir / filename).write_bytes(jpeg)
    a = Analysis(
        user_id=user.id, device_id=(x_device_id or "")[:64], crop=result.get("crop") or crop or "Unknown", image_file=filename, notes=notes, lang=lang,
        health_score=int(result.get("health_score", 0)), health_status=result.get("health_status", "healthy"),
        provider=result.get("engine", ai.provider_name()), result=result,
    )
    session.add(a)
    session.commit()
    return serialize(a)


@app.get("/api/analyses")
def list_analyses(favorite: bool | None = None, limit: int = 100, session: Session = Depends(get_session), user: User = Depends(current_user)):
    q = select(Analysis).where(Analysis.user_id == user.id).order_by(Analysis.created_at.desc()).limit(min(limit, 500))
    if favorite is not None:
        q = q.where(Analysis.favorite == favorite)
    return [serialize(a, full=False) for a in session.scalars(q)]


@app.get("/api/analyses/{analysis_id}")
def get_analysis(analysis_id: str, session: Session = Depends(get_session), user: User = Depends(current_user)):
    return serialize(_load(session, analysis_id, user))


class FavoriteIn(BaseModel):
    favorite: bool


@app.patch("/api/analyses/{analysis_id}/favorite")
def set_favorite(analysis_id: str, body: FavoriteIn, session: Session = Depends(get_session), user: User = Depends(current_user)):
    a = _load(session, analysis_id, user)
    a.favorite = body.favorite
    session.commit()
    return serialize(a, full=False)


@app.delete("/api/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: str, session: Session = Depends(get_session), user: User = Depends(current_user)):
    a = _load(session, analysis_id, user)
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
def chat(body: ChatIn, request: Request, session: Session = Depends(get_session), user: User = Depends(current_user)):
    limiter.hit([f"chat:user:{user.id}", f"chat:ip:{client_ip(request)}"], settings.chat_per_hour)
    analysis = _load(session, body.analysis_id, user).result if body.analysis_id else None
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
    return ai.chat([m.model_dump() for m in body.messages], analysis, jpeg, body.lang)


class FertilizerIn(BaseModel):
    crop: str | None = None
    stage: str | None = None
    analysis_id: str | None = None


@app.post("/api/fertilizer")
def fertilizer(body: FertilizerIn, session: Session = Depends(get_session), user: User = Depends(current_user)):
    if body.analysis_id:
        r = _load(session, body.analysis_id, user).result
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
def stats(session: Session = Depends(get_session), user: User = Depends(current_user)):
    rows = list(session.scalars(select(Analysis).where(Analysis.user_id == user.id).order_by(Analysis.created_at)))
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
