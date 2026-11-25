import io
import os
import tempfile

tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{tmp}/uploads"
os.environ["AI_PROVIDER"] = "offline"  # main flow uses the knowledge-base path; Ollama is mocked below

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402

from app import knowledge as kb  # noqa: E402
from app.main import app  # noqa: E402

H = {"X-Device-Id": "test-device"}


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
        assert c.get("/api/analyses", headers={"X-Device-Id": "other"}).json() == []
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


def _mock_ollama(monkeypatch, installed, settings_kw=None, answer=None):
    """Point app.ai at a fake Ollama server; returns the list of (path, body) calls."""
    import json as _json

    import httpx

    from app import ai
    from app.config import Settings

    calls = []
    answer = answer or {
        "crop": "Tomato", "health_score": 55, "growth_stage": "Fruiting stage", "summary": "Early blight on lower leaves.",
        "issues": [{"name": "Early blight", "confidence": 85, "severity": "severe-ish", "description": "Target spots."}],
        "treatment": [{"title": "Remove leaves", "description": "Bag and destroy them."}],
        "harvest": {"readiness_percent": 30},
    }

    def handler(req: httpx.Request):
        body = _json.loads(req.content) if req.content else {}
        calls.append((req.url.path, body))
        if req.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": n, "model": n} for n in installed]})
        if req.url.path == "/api/pull":
            installed.append(body["model"])
            return httpx.Response(200, json={"status": "success"})
        if "format" in body:
            return httpx.Response(200, json={"message": {"role": "assistant", "content": _json.dumps(answer)}, "done": True})
        return httpx.Response(200, json={"message": {"role": "assistant", "content": f"reply from {body['model']}"}, "done": True})

    kw = {"ai_provider": "ollama", "ollama_model": "llama3.2", "ollama_vision_model": "qwen3-vl:4b"} | (settings_kw or {})
    monkeypatch.setattr(ai, "settings", Settings(**kw))
    monkeypatch.setattr(ai, "_http", lambda timeout=None: httpx.Client(base_url="http://ollama", transport=httpx.MockTransport(handler)))
    return calls


def _mock_gemini(monkeypatch, answer=None, api_key="unit-test-key"):
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


def test_ollama_llama32_chat_plus_vision_model(monkeypatch):
    """Llama 3.2 (same as the Dietitian AI API) answers chat; the open vision model reads photos."""
    from app import ai

    calls = _mock_ollama(monkeypatch, ["llama3.2:latest", "qwen3-vl:4b"])
    ai.ensure_model()
    assert ai.ai_ready() and ai.vision_ready()
    assert ai.status_summary()["chat_model"] == "llama3.2"

    out = ai.analyze(_jpeg((2000, 1500)), STATS, "tomato", "spots", "zu")
    path, body = calls[-1]
    assert path == "/api/chat" and body["model"] == "qwen3-vl:4b" and body["stream"] is False
    assert body["format"]["type"] == "object" and "issues" in body["format"]["properties"]
    assert body["messages"][1]["images"] and "isiZulu" in body["messages"][0]["content"]
    # clean-up of a loose open-model answer
    assert out["engine"] == "ollama:qwen3-vl:4b" and out["growth_stage"] == "fruiting"
    assert out["health_status"] == "moderate" and out["issues"][0]["confidence"] == 0.85 and out["issues"][0]["severity"] == "medium"
    assert out["watering"]["frequency"] == "—" and out["market"]["quality_grade"] == "N/A" and out["fertilizer"]["stage"] == "fruiting"

    r = ai.chat([{"role": "assistant", "content": "Hi"}, {"role": "user", "content": "treat tomato blight?"}], out, None)
    path, body = calls[-1]
    assert r["reply"] == "reply from llama3.2" and r["provider"] == "ollama:llama3.2"
    assert body["messages"][0]["role"] == "system" and "Early blight" in body["messages"][0]["content"]
    assert body["messages"][1]["role"] == "user" and "images" not in body["messages"][-1]

    r = ai.chat([{"role": "user", "content": "what is this?"}], None, _jpeg())
    assert calls[-1][1]["model"] == "qwen3-vl:4b" and calls[-1][1]["messages"][-1]["images"]


def test_ollama_llama32_only_text_analysis(monkeypatch):
    """With only llama3.2 installed (the Dietitian AI API's setup), photos are analysed from notes + leaf colour."""
    from app import ai

    calls = _mock_ollama(monkeypatch, ["llama3.2:latest"], {"ollama_auto_pull": False})
    ai.ensure_model()
    assert ai.ai_ready() and not ai.vision_ready() and ai.model_status["vision"]["state"] == "missing"
    out = ai.analyze(_jpeg(), STATS, "tomato", "brown rings on old leaves", "en")
    path, body = calls[-1]
    assert body["model"] == "llama3.2" and "images" not in body["messages"][1] and "brown 30%" in body["messages"][1]["content"]
    assert out["engine"] == "ollama:llama3.2 (text-only)" and out["crop_confidence"] <= 0.5
    assert out["summary"].startswith("Based on your notes")
    r = ai.chat([{"role": "user", "content": "what is this?"}], None, _jpeg(), image_stats=STATS)
    assert calls[-1][1]["model"] == "llama3.2" and "cannot see" in calls[-1][1]["messages"][0]["content"]


def test_ollama_auto_pulls_missing_models(monkeypatch):
    from app import ai

    calls = _mock_ollama(monkeypatch, [])
    ai.ensure_model()
    pulls = [b["model"] for p, b in calls if p == "/api/pull"]
    assert pulls == ["llama3.2", "qwen3-vl:4b"] and ai.ai_ready() and ai.vision_ready()


def test_ollama_down_falls_back(monkeypatch):
    import httpx

    from app import ai
    from app.config import Settings

    def boom(req):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(ai, "settings", Settings(ai_provider="ollama"))
    monkeypatch.setattr(ai, "_http", lambda timeout=None: httpx.Client(base_url="http://ollama", transport=httpx.MockTransport(boom)))
    ai.ensure_model()
    assert ai.model_status["chat"]["state"] == "unavailable" and not ai.ai_ready()
    out = ai.analyze(_jpeg((200, 200)), STATS, "maize", None)
    assert out["engine"] == "offline-knowledge-base" and "isn't running" in out["summary"]
    r = ai.chat([{"role": "user", "content": "How often should I water maize?"}], None, None)
    assert r["provider"] == "offline-knowledge-base" and "Watering" in r["reply"]


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


def test_settings_share_dietitian_api_env(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("OLLAMA_BASE_URL", "http://ollama:11434/")
    monkeypatch.setenv("OLLAMA_VISION_MODEL", "none")
    s = Settings()
    assert s.ollama_url == "http://ollama:11434" and s.ollama_model == "llama3.2" and s.ollama_vision_model == ""


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

    text = ai._gemini_generate([{"role": "user", "parts": [{"text": "hi"}]}], system="s")
    assert text == "Water at the base."
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
