import io
import os
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{tmp}/uploads"
os.environ["AI_PROVIDER"] = "offline"  # main flow uses the knowledge-base path; Gemini is mocked below

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import knowledge as kb  # noqa: E402
from app.main import app  # noqa: E402



def _account(c, identifier, name="Test Farmer", password="correct-horse-1", device=None):
    """Sign up (or sign in, if the account exists) and return the Authorization header."""
    headers = {"X-Device-Id": device} if device else {}
    r = c.post("/api/auth/register", json={"name": name, "identifier": identifier, "password": password}, headers=headers)
    if r.status_code == 409:
        r = c.post("/api/auth/login", json={"identifier": identifier, "password": password}, headers=headers)
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


with TestClient(app) as _c:  # one farmer for most tests, one for "someone else"
    H = _account(_c, "082 123 4567")
    OTHER = _account(_c, "other.farmer@example.com", name="Other Farmer")


def _img(colour):
    buf = io.BytesIO()
    img = Image.new("RGB", (300, 300), colour)
    # sprinkle some brown spots
    for x in range(40, 260, 30):
        for y in range(40, 260, 30):
            for dx in range(18):
                for dy in range(18):
                    img.putpixel((x + dx, y + dy), (120, 70, 20))
    img.save(buf, "PNG")
    return buf.getvalue()


def test_flow():
    with TestClient(app) as c:
        assert c.get("/health").json()["status"] == "ok"
        r = c.post("/api/analyze", headers=H, files={"image": ("leaf.png", _img((60, 150, 50)), "image/png")},
                   data={"crop": "tomato", "notes": "spots on lower leaves"})
        assert r.status_code == 200, r.text
        a = r.json()
        res = a["result"]
        assert res["crop"] == "Tomato"
        assert res["issues"], "brown spots should be flagged"
        assert res["fertilizer"]["npk"]["n"] >= 0 and res["treatment"]
        # history, favorite, stats
        assert len(c.get("/api/analyses", headers=H).json()) == 1
        assert c.get("/api/analyses", headers=OTHER).json() == []
        assert c.patch(f"/api/analyses/{a['id']}/favorite", headers=H, json={"favorite": True}).json()["favorite"]
        assert len(c.get("/api/analyses?favorite=true", headers=H).json()) == 1
        s = c.get("/api/stats", headers=H).json()
        assert s["total"] == 1 and s["favorites"] == 1
        # image served
        assert c.get(a["image_url"]).status_code == 200
        # chat with analysis context
        r = c.post("/api/chat", headers=H, json={"messages": [{"role": "user", "content": "How often should I water these plants?"}],
                                                  "analysis_id": a["id"]})
        assert r.status_code == 200 and "Watering" in r.json()["reply"]
        # fertilizer
        f = c.post("/api/fertilizer", headers=H, json={"analysis_id": a["id"]}).json()
        assert f["schedule"]
        assert c.delete(f"/api/analyses/{a['id']}", headers=H).status_code == 204


def test_bad_image():
    with TestClient(app) as c:
        r = c.post("/api/analyze", headers=H, files={"image": ("x.jpg", b"not an image", "image/jpeg")})
        assert r.status_code == 400


def test_retrieval_examples():
    assert kb.search("Why are my tomato leaves turning yellow?")[0]["id"] == "yellow-leaves"
    assert kb.search("How often should I water these plants?")[0]["id"] == "watering-principles"
    assert kb.search("What can I do about these spots on my leaves?")[0]["id"] == "leaf-spots"
    assert kb.search("Are my tomatoes ready for harvesting?")[0]["id"] == "harvest-readiness"
    assert kb.search("How can I improve my crop production?")[0]["id"] == "improve-yield"
    assert kb.search("How do I treat tomato blight?")[0]["id"] == "tomato-blight"


def _mock_gemini(monkeypatch, answer=None, api_key="unit-test-key", plant=True):
    import json as _json

    import httpx

    from app import ai
    from app.config import Settings

    calls = []
    answer = answer or {
        "crop": "Tomato", "health_score": 55, "growth_stage": "fruiting", "summary": "Early blight on lower leaves.",
        "issues": [{"name": "Early blight", "type": "disease", "confidence": 0.85, "severity": "high",
                    "description": "Target spots.", "evidence": "Brown rings on lower leaves."}],
    }

    def handler(req: httpx.Request):
        body = _json.loads(req.content)
        calls.append((req, body))
        schema = body["generationConfig"].get("responseSchema") or {}
        if "reason" in schema.get("properties", {}):  # the "is this a plant?" check
            verdict = {"is_plant": plant, "reason": "Tomato leaves." if plant else "A garden trowel on soil."}
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": _json.dumps(verdict)}]}}]})
        text = answer.get("reply") if "responseMimeType" not in body["generationConfig"] and "reply" in answer else _json.dumps(answer)
        return httpx.Response(200, json={
            "candidates": [{"content": {"parts": [{"text": text}]}}],
        })

    monkeypatch.setattr(ai, "settings", Settings(
        ai_provider="gemini", gemini_api_key=api_key, gemini_model="gemini-flash-latest",
    ))
    monkeypatch.setattr(ai, "_gemini_http", lambda: httpx.Client(
        headers={"x-goog-api-key": api_key}, transport=httpx.MockTransport(handler),
    ))
    return calls


def _jpeg(size=(800, 600)):
    b = io.BytesIO(); Image.new("RGB", size, (60, 150, 50)).save(b, "JPEG"); return b.getvalue()


STATS = {"plant_coverage": 0.9, "green_ratio": 0.6, "yellow_ratio": 0.1, "brown_ratio": 0.3, "red_ratio": 0, "dark_ratio": 0}


def test_gemini_analysis_sends_image_and_structured_schema(monkeypatch):
    from app import ai

    calls = _mock_gemini(monkeypatch)
    out = ai.analyze(_jpeg((2000, 1500)), STATS, "tomato", "spots", "zu")
    req, body = calls[-1]

    assert req.url.path == "/v1beta/models/gemini-flash-latest:generateContent"
    assert req.headers["x-goog-api-key"] == "unit-test-key"
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert body["generationConfig"]["responseSchema"]["type"] == "object"
    assert "minimum" not in body["generationConfig"]["responseSchema"]["properties"]["crop_confidence"]
    parts = body["contents"][0]["parts"]
    assert "isiZulu" in body["systemInstruction"]["parts"][0]["text"]
    assert parts[1]["inlineData"]["mimeType"] == "image/jpeg"
    assert out["engine"] == "gemini:gemini-flash-latest" and out["issues"][0]["name"] == "Early blight"


def test_gemini_chat_maps_roles_and_attaches_photo(monkeypatch):
    from app import ai

    calls = _mock_gemini(monkeypatch, {"reply": "Check the lower leaves for spreading spots."})
    result = ai.chat([
        {"role": "assistant", "content": "Welcome"},
        {"role": "user", "content": "What do you see?"},
        {"role": "assistant", "content": "Please share a photo."},
        {"role": "user", "content": "Here it is."},
    ], None, _jpeg())

    req, body = calls[-1]
    contents = body["contents"]
    assert [turn["role"] for turn in contents] == ["user", "model", "user"]
    assert contents[-1]["parts"][1]["inlineData"]["mimeType"] == "image/jpeg"
    assert result["reply"] == "Check the lower leaves for spreading spots."
    assert result["provider"] == "gemini:gemini-flash-latest"
    assert req.headers["x-goog-api-key"] == "unit-test-key"


def test_gemini_without_key_explains_configuration_and_uses_offline(monkeypatch):
    from app import ai
    from app.config import Settings

    monkeypatch.setattr(ai, "settings", Settings(ai_provider="gemini", gemini_api_key=""))
    health = ai.status_summary()
    assert health["model_status"] == "missing" and not health["ai_ready"]
    assert "GEMINI_API_KEY" in health["model_detail"]

    result = ai.analyze(_jpeg(), STATS, "maize", None)
    assert result["engine"] == "offline-knowledge-base"
    assert result["summary"].startswith("Gemini API key is missing")
    chat = ai.chat([{"role": "user", "content": "How often should I water maize?"}], None, None)
    assert chat["provider"] == "offline-knowledge-base"
    assert "Gemini API key is missing" in chat["reply"]


def test_gemini_overloaded_model_falls_back_to_next_model(monkeypatch):
    """A 503 "high demand" from the main model is retried, then the fallback model answers."""
    import httpx

    from app import ai
    from app.config import Settings

    paths = []

    def handler(req: httpx.Request):
        paths.append(req.url.path)
        if "gemini-flash-latest" in req.url.path:
            return httpx.Response(503, json={"error": {"code": 503, "status": "UNAVAILABLE"}})
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": "Water at the base."}]}}]})

    monkeypatch.setattr(ai, "settings", Settings(
        ai_provider="gemini", gemini_api_key="k", gemini_model="gemini-flash-latest",
        gemini_fallback_models=["gemini-flash-lite-latest"],
    ))
    monkeypatch.setattr(ai, "_gemini_http", lambda: httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(ai.time, "sleep", lambda s: None)

    text, model = ai._gemini_generate([{"role": "user", "parts": [{"text": "hi"}]}], system="s")
    assert text == "Water at the base." and model == "gemini-flash-lite-latest"
    assert paths == [
        "/v1beta/models/gemini-flash-latest:generateContent",
        "/v1beta/models/gemini-flash-latest:generateContent",
        "/v1beta/models/gemini-flash-lite-latest:generateContent",
    ]


def test_gemini_all_models_failing_raises(monkeypatch):
    import httpx
    import pytest

    from app import ai
    from app.config import Settings

    monkeypatch.setattr(ai, "settings", Settings(
        ai_provider="gemini", gemini_api_key="k", gemini_model="a", gemini_fallback_models=["b"],
    ))
    monkeypatch.setattr(ai, "_gemini_http", lambda: httpx.Client(
        transport=httpx.MockTransport(lambda req: httpx.Response(503, json={}))))
    monkeypatch.setattr(ai.time, "sleep", lambda s: None)
    with pytest.raises(RuntimeError, match="All Gemini models failed"):
        ai._gemini_generate([{"role": "user", "parts": [{"text": "hi"}]}], system="s")


# ---------------------------------------------------------------- plant gate, limits, ownership, migrations

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _fresh_limits():
    from app.ratelimit import limiter

    limiter.reset()
    yield
    limiter.reset()


def _grey_png():
    b = io.BytesIO(); Image.new("RGB", (300, 300), (128, 128, 128)).save(b, "PNG"); return b.getvalue()


def _count(c, headers=H):
    return len(c.get("/api/analyses", headers=headers).json())


def test_photo_without_plant_is_rejected_and_not_saved():
    """Offline check: a grey photo has no plant-coloured pixels, so it is never analysed or stored."""
    with TestClient(app) as c:
        before = _count(c)
        r = c.post("/api/analyze", headers=H, files={"image": ("wall.png", _grey_png(), "image/png")})
        assert r.status_code == 422
        assert "doesn't show a plant" in r.json()["detail"]
        assert _count(c) == before


def test_gemini_plant_check_rejects_before_analysis(monkeypatch):
    from app import ai

    calls = _mock_gemini(monkeypatch, plant=False)
    with TestClient(app) as c:
        before = _count(c)
        r = c.post("/api/analyze", headers=H, files={"image": ("leaf.png", _img((60, 150, 50)), "image/png")})
        assert r.status_code == 422
        assert "garden trowel" in r.json()["detail"]
        assert _count(c) == before
    assert len(calls) == 1, "only the cheap plant check may run, never the full analysis"
    assert calls[0][0].url.path == "/v1beta/models/gemini-flash-lite-latest:generateContent"
    assert ai.settings.gemini_model == "gemini-flash-latest"


def test_gemini_plant_check_passes_then_analyses(monkeypatch):
    calls = _mock_gemini(monkeypatch, plant=True)
    with TestClient(app) as c:
        r = c.post("/api/analyze", headers=H, files={"image": ("leaf.png", _img((60, 150, 50)), "image/png")}, data={"crop": "tomato"})
        assert r.status_code == 200, r.text
        assert r.json()["provider"] == "gemini:gemini-flash-latest"
        c.delete(f"/api/analyses/{r.json()['id']}", headers=H)
    assert len(calls) == 2


def test_sign_in_is_required():
    with TestClient(app) as c:
        assert c.get("/api/analyses").status_code == 401
        assert c.get("/api/analyses", headers={"Authorization": "Bearer not-a-real-token"}).status_code == 401
        assert c.post("/api/chat", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 401
        assert c.get("/api/stats").status_code == 401
        # the knowledge base stays public
        assert c.get("/api/guides").status_code == 200 and c.get("/health").status_code == 200


def test_other_farmer_cannot_read_change_or_delete():
    other = OTHER
    with TestClient(app) as c:
        a = c.post("/api/analyze", headers=H, files={"image": ("leaf.png", _img((60, 150, 50)), "image/png")}).json()
        assert c.get(f"/api/analyses/{a['id']}", headers=other).status_code == 404
        assert c.patch(f"/api/analyses/{a['id']}/favorite", headers=other, json={"favorite": True}).status_code == 404
        assert c.delete(f"/api/analyses/{a['id']}", headers=other).status_code == 404
        assert c.get(f"/api/analyses/{a['id']}", headers=H).status_code == 200


def test_delete_removes_record_and_photo():
    from app.config import settings

    with TestClient(app) as c:
        a = c.post("/api/analyze", headers=H, files={"image": ("leaf.png", _img((60, 150, 50)), "image/png")}).json()
        photo = settings.upload_dir / a["image_url"].rsplit("/", 1)[-1]
        assert photo.exists()
        assert c.delete(f"/api/analyses/{a['id']}", headers=H).status_code == 204
        assert not photo.exists()
        assert c.get(f"/api/analyses/{a['id']}", headers=H).status_code == 404


def test_upload_size_limit(monkeypatch):
    from app import main

    monkeypatch.setattr(main, "settings", main.settings.__class__(max_upload_mb=0))
    with TestClient(app) as c:
        r = c.post("/api/analyze", headers=H, files={"image": ("leaf.png", _img((60, 150, 50)), "image/png")})
        assert r.status_code == 413


def test_rate_limit_per_farmer_and_ip(monkeypatch):
    from app import main

    monkeypatch.setattr(main, "settings", main.settings.__class__(chat_per_hour=2))
    msg = {"messages": [{"role": "user", "content": "How often should I water maize?"}]}
    with TestClient(app) as c:
        assert c.post("/api/chat", headers=H, json=msg).status_code == 200
        assert c.post("/api/chat", headers=H, json=msg).status_code == 200
        r = c.post("/api/chat", headers=H, json=msg)
        assert r.status_code == 429 and "Retry-After" in r.headers
        # another account from the same address is still limited
        assert c.post("/api/chat", headers=OTHER, json=msg).status_code == 429


def test_migrations_stamp_a_database_made_before_alembic(tmp_path, monkeypatch):
    """An existing table without alembic_version is adopted, not recreated (keeps people's scans)."""
    import sqlalchemy as sa

    from app import db

    eng = sa.create_engine(f"sqlite:///{tmp_path}/old.db")
    with eng.begin() as conn:  # the schema as it was before migrations existed: just the analyses table
        conn.execute(sa.text("CREATE TABLE analyses (id VARCHAR(36) PRIMARY KEY, created_at DATETIME NOT NULL, device_id VARCHAR(64) NOT NULL,"
                             " crop VARCHAR(80) NOT NULL, image_file VARCHAR(200) NOT NULL, notes TEXT, lang VARCHAR(8) NOT NULL,"
                             " health_score INTEGER NOT NULL, health_status VARCHAR(20) NOT NULL, favorite BOOLEAN NOT NULL,"
                             " provider VARCHAR(80) NOT NULL, result JSON NOT NULL)"))
        conn.execute(sa.text("INSERT INTO analyses (id, created_at, device_id, crop, image_file, lang, health_score,"
                             " health_status, favorite, provider, result) VALUES ('x', '2026-01-01', 'dev-12345678',"
                             " 'Tomato', 'a.jpg', 'en', 80, 'healthy', 0, 'offline', '{}')"))
    monkeypatch.setattr(db, "engine", eng)
    db.init_db()
    with eng.connect() as conn:
        assert conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar() == "0002"
        assert conn.execute(sa.text("SELECT count(*) FROM analyses WHERE user_id IS NULL")).scalar() == 1
        assert conn.execute(sa.text("SELECT count(*) FROM users")).scalar() == 0


def test_gemini_down_falls_back_to_knowledge_base(monkeypatch):
    """Every Gemini model failing still gives the farmer an answer, clearly marked as an estimate."""
    import httpx

    from app import ai
    from app.config import Settings

    monkeypatch.setattr(ai, "settings", Settings(ai_provider="gemini", gemini_api_key="k"))
    monkeypatch.setattr(ai, "_gemini_http", lambda: httpx.Client(
        transport=httpx.MockTransport(lambda req: httpx.Response(503, json={}))))
    monkeypatch.setattr(ai.time, "sleep", lambda s: None)

    out = ai.analyze(_jpeg(), STATS, "tomato", None)
    assert out["engine"] == "offline-knowledge-base"
    assert out["summary"].startswith("Gemini Flash is unavailable")
    assert out["expert_check"]["recommended"], "an offline estimate must point the farmer to an expert"
    reply = ai.chat([{"role": "user", "content": "How often should I water tomatoes?"}], None, None)
    assert reply["provider"] == "offline-knowledge-base" and "Watering" in reply["reply"]


def test_expert_check_flags_severe_and_uncertain_results():
    from app.ai import expert_check

    healthy = {"health_status": "healthy", "issues": [], "crop_confidence": 0.9, "engine": "gemini:x"}
    assert expert_check(healthy) == {"recommended": False, "codes": [], "reasons": []}
    severe = healthy | {"health_status": "severe", "issues": [{"severity": "high", "confidence": 0.9}]}
    assert expert_check(severe)["recommended"] and expert_check(severe)["codes"] == ["severe"]
    unsure = healthy | {"issues": [{"severity": "low", "confidence": 0.3}]}
    assert "not sure what the problem is" in expert_check(unsure)["reasons"][0]
    wrong_crop = healthy | {"crop_confidence": 0.2}
    assert "which crop" in expert_check(wrong_crop)["reasons"][0]


def test_ai_writes_in_south_african_languages(monkeypatch):
    """The 11 official spoken languages reach the AI by name; anything else falls back to English."""
    from app import ai

    assert len(ai.LANGUAGES) == 11
    calls = _mock_gemini(monkeypatch)
    for code, name in [("ve", "Tshivenda"), ("nso", "Sepedi"), ("ts", "Xitsonga"), ("fr", "English")]:
        ai.analyze(_jpeg(), STATS, "tomato", None, code)
        assert name in calls[-1][1]["systemInstruction"]["parts"][0]["text"], code


# ---------------------------------------------------------------- accounts

def test_register_login_me_logout():
    with TestClient(app) as c:
        r = c.post("/api/auth/register", json={"name": " Thandi ", "identifier": "071 555 0000", "password": "maize-2026-ok"})
        assert r.status_code == 201, r.text
        assert r.json()["user"] == {"id": r.json()["user"]["id"], "name": "Thandi", "identifier": "+27715550000"}
        # the same number written differently is the same account
        assert c.post("/api/auth/register", json={"name": "x", "identifier": "+27 71 555 0000", "password": "another-pass"}).status_code == 409
        bad = c.post("/api/auth/login", json={"identifier": "0715550000", "password": "wrong-password"})
        assert bad.status_code == 401 and "Wrong" in bad.json()["detail"]
        unknown = c.post("/api/auth/login", json={"identifier": "0719999999", "password": "maize-2026-ok"})
        assert unknown.status_code == 401 and unknown.json()["detail"] == bad.json()["detail"], "no hint which accounts exist"
        ok = c.post("/api/auth/login", json={"identifier": "27715550000", "password": "maize-2026-ok"})
        h = {"Authorization": f"Bearer {ok.json()['token']}"}
        assert c.get("/api/auth/me", headers=h).json()["name"] == "Thandi"
        assert c.post("/api/auth/logout", headers=h).status_code == 204
        assert c.get("/api/auth/me", headers=h).status_code == 401


def test_register_validates_input():
    with TestClient(app) as c:
        short = c.post("/api/auth/register", json={"name": "A", "identifier": "0821112222", "password": "short"})
        assert short.status_code == 422
        bad_phone = c.post("/api/auth/register", json={"name": "A", "identifier": "12ab", "password": "long-enough-1"})
        assert bad_phone.status_code == 400 and "phone number" in bad_phone.json()["detail"]
        bad_email = c.post("/api/auth/register", json={"name": "A", "identifier": "me@nowhere", "password": "long-enough-1"})
        assert bad_email.status_code == 400
        email = c.post("/api/auth/register", json={"name": "A", "identifier": "Farmer.Joe@Example.COM", "password": "long-enough-1"})
        assert email.json()["user"]["identifier"] == "farmer.joe@example.com"


def test_passwords_are_hashed_and_tokens_not_stored():
    from sqlalchemy import select

    from app.auth import verify_password
    from app.db import AuthSession, SessionLocal, User

    with TestClient(app) as c:
        token = c.post("/api/auth/register", json={"name": "Sipho", "identifier": "0634445555", "password": "secret-pass-9"}).json()["token"]
    with SessionLocal() as s:
        user = s.scalar(select(User).where(User.identifier == "+27634445555"))
        assert "secret-pass-9" not in user.password_hash and user.password_hash.startswith("scrypt$")
        assert verify_password("secret-pass-9", user.password_hash) and not verify_password("nope", user.password_hash)
        assert s.get(AuthSession, token) is None, "the raw token must never be stored"


def test_scans_made_before_signing_in_move_to_the_account():
    from app.db import Analysis, SessionLocal

    with SessionLocal() as s:
        s.add(Analysis(device_id="web-phone-of-lerato", crop="Maize", image_file="x.jpg", lang="en", health_score=80,
                       health_status="healthy", favorite=False, provider="offline", result={"summary": "ok"}))
        s.commit()
    with TestClient(app) as c:
        h = _account(c, "lerato@example.com", name="Lerato", device="web-phone-of-lerato")
        mine = c.get("/api/analyses", headers=h).json()
        assert [a["crop"] for a in mine] == ["Maize"]
        assert c.get("/api/analyses", headers=OTHER).json() == []


def test_login_attempts_are_limited():
    with TestClient(app) as c:
        c.post("/api/auth/register", json={"name": "N", "identifier": "0820000001", "password": "right-password"})
        codes = [c.post("/api/auth/login", json={"identifier": "0820000001", "password": f"guess-{i}"}).status_code for i in range(11)]
        assert codes[:10] == [401] * 10 and codes[10] == 429
