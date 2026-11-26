"""AI providers for Crop Advisor.

Default: **Gemini Flash** (hosted by Google, needs GEMINI_API_KEY), retried and then handed to the
GEMINI_FALLBACK_MODELS when the main model is busy. Photos are checked for a plant before analysis.
Optional: Anthropic Claude (AI_PROVIDER=anthropic).
Always available: an offline knowledge-base fallback, so the app keeps working if the AI is down.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import time

import httpx
from PIL import Image

from . import knowledge as kb
from .config import settings

log = logging.getLogger("crop-advisor.ai")

# South Africa's 11 official spoken languages. The names tell the AI exactly which language to write.
LANGUAGES = {
    "en": "English",
    "af": "Afrikaans",
    "zu": "isiZulu (Zulu)",
    "xh": "isiXhosa (Xhosa)",
    "nr": "isiNdebele (South African Ndebele)",
    "nso": "Sepedi (Sesotho sa Leboa, Northern Sotho)",
    "st": "Sesotho (Southern Sotho)",
    "tn": "Setswana (Tswana)",
    "ss": "siSwati (Swati)",
    "ve": "Tshivenda (Venda)",
    "ts": "Xitsonga (Tsonga)",
}

ANALYSIS_TOOL = {
    "name": "report_plant_analysis",
    "description": "Report a structured analysis of the plant photo for a farmer.",
    "input_schema": {
        "type": "object",
        "properties": {
            "is_plant": {"type": "boolean", "description": "False if the photo does not show a plant or crop."},
            "crop": {"type": "string", "description": "Crop name, e.g. Tomato, Maize. Use the farmer's crop if given and consistent with the photo."},
            "crop_confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "health_status": {"type": "string", "enum": ["healthy", "mild", "moderate", "severe"]},
            "health_score": {"type": "integer", "minimum": 0, "maximum": 100},
            "summary": {"type": "string", "description": "2-3 plain-language sentences for the farmer."},
            "growth_stage": {"type": "string", "enum": ["seedling", "vegetative", "flowering", "fruiting", "mature"]},
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "type": {"type": "string", "enum": ["disease", "pest", "nutrient", "water", "environmental", "other"]},
                        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                        "description": {"type": "string"},
                        "evidence": {"type": "string", "description": "What in the photo points to this."},
                    },
                    "required": ["name", "type", "confidence", "severity", "description"],
                },
            },
            "treatment": {
                "type": "array",
                "description": "Ordered, practical treatment steps. Empty if healthy.",
                "items": {"type": "object", "properties": {"title": {"type": "string"}, "description": {"type": "string"}}, "required": ["title", "description"]},
            },
            "prevention": {"type": "array", "items": {"type": "string"}},
            "watering": {
                "type": "object",
                "properties": {"frequency": {"type": "string"}, "amount": {"type": "string"}, "advice": {"type": "string"}},
                "required": ["frequency", "amount", "advice"],
            },
            "harvest": {
                "type": "object",
                "properties": {
                    "ready": {"type": "boolean"},
                    "readiness_percent": {"type": "integer", "minimum": 0, "maximum": 100},
                    "estimated_days": {"type": "string", "description": "e.g. '7-10 days' or 'Ready now' or 'Not applicable'"},
                    "signs": {"type": "string"},
                    "advice": {"type": "string"},
                },
                "required": ["ready", "readiness_percent", "estimated_days", "advice"],
            },
            "market": {
                "type": "object",
                "properties": {"quality_grade": {"type": "string", "enum": ["A", "B", "C", "N/A"]}, "advice": {"type": "string"}},
                "required": ["quality_grade", "advice"],
            },
            "yield_tips": {"type": "array", "items": {"type": "string"}},
            "follow_up_questions": {"type": "array", "items": {"type": "string"}, "description": "2-3 questions the farmer could ask next."},
        },
        "required": ["is_plant", "crop", "health_status", "health_score", "summary", "growth_stage", "issues",
                     "treatment", "prevention", "watering", "harvest", "market", "yield_tips"],
    },
}

SAFETY = (
    "Safety rules: recommend only chemicals by active ingredient or class, tell the farmer to use products "
    "registered for the crop in their country, follow the label and pre-harvest interval, and wear protection. "
    "Prefer cultural and biological controls first. When unsure, say so and suggest confirming with a local "
    "extension officer or agro-dealer. Never invent statistics."
)


# ---------------------------------------------------------------- provider plumbing

STAGES = ["seedling", "vegetative", "flowering", "fruiting", "mature"]


def active_provider() -> str:
    p = settings.ai_provider
    if p == "gemini":
        return "gemini"
    if p == "anthropic" and settings.anthropic_api_key:
        return "anthropic"
    return "offline"


def provider_name() -> str:
    return {
        "gemini": f"gemini:{settings.gemini_model}",
        "anthropic": f"claude:{settings.anthropic_model}",
    }.get(active_provider(), "offline-knowledge-base")


def _gemini_http() -> httpx.Client:
    if not settings.gemini_api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    return httpx.Client(
        headers={"x-goog-api-key": settings.gemini_api_key},
        timeout=settings.gemini_timeout,
    )


_GEMINI_SCHEMA_KEYS = {"type", "description", "enum", "items", "properties", "required"}


def _gemini_schema(schema: dict) -> dict:
    """Keep the analysis JSON Schema within the Gemini API's supported subset."""
    out = {key: value for key, value in schema.items() if key in _GEMINI_SCHEMA_KEYS and key not in ("items", "properties")}
    if "items" in schema:
        out["items"] = _gemini_schema(schema["items"])
    if "properties" in schema:
        out["properties"] = {name: _gemini_schema(value) for name, value in schema["properties"].items()}
    return out


# Google answers 429/5xx when a model is rate-limited or overloaded ("high demand"); those are
# temporary, so retry once and then move on to the fallback models instead of going offline.
_GEMINI_RETRY_STATUS = {429, 500, 502, 503, 504}


def _gemini_models() -> list[str]:
    models = [settings.gemini_model, *settings.gemini_fallback_models]
    return list(dict.fromkeys(m for m in models if m))


def _gemini_post(body: dict, models: list[str] | None = None) -> tuple[dict, str]:
    """POST to the first Gemini model that answers. Returns (response JSON, model that answered)."""
    last_error: Exception | None = None
    models = models or _gemini_models()
    with _gemini_http() as client:
        for n, model in enumerate(models):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            # Shorter wait on every model but the last, so a stalled model hands over quickly.
            timeout = settings.gemini_timeout if n == len(models) - 1 else min(settings.gemini_first_timeout, settings.gemini_timeout)
            for attempt in range(2):
                try:
                    response = client.post(url, json=body, timeout=timeout)
                except httpx.TimeoutException as exc:
                    # A timed-out model is unlikely to answer a retry quickly; try the next one.
                    log.warning("Gemini model %s timed out", model)
                    last_error = exc
                    break
                except httpx.TransportError as exc:
                    log.warning("Gemini request to %s failed: %s", model, exc)
                    last_error = exc
                    continue
                if response.status_code in _GEMINI_RETRY_STATUS:
                    log.warning("Gemini model %s returned %s (attempt %d)", model, response.status_code, attempt + 1)
                    last_error = httpx.HTTPStatusError(
                        f"Gemini {model} returned {response.status_code}", request=response.request, response=response,
                    )
                    if attempt == 0:
                        time.sleep(1.5)
                    continue
                if response.status_code == 404:
                    # Model retired or not offered to this key: try the next one.
                    log.warning("Gemini model %s is not available (404)", model)
                    last_error = httpx.HTTPStatusError(
                        f"Gemini model {model} not found", request=response.request, response=response,
                    )
                    break
                response.raise_for_status()
                if model != models[0]:
                    log.info("Gemini answered with fallback model %s", model)
                return response.json(), model
    raise RuntimeError(f"All Gemini models failed: {last_error}")


def _gemini_generate(
    contents: list[dict],
    system: str,
    response_schema: dict | None = None,
    temperature: float = 0.3,
    max_output_tokens: int = 512,
    models: list[str] | None = None,
) -> tuple[str, str]:
    """Returns (text, model that answered)."""
    generation_config = {"temperature": temperature, "maxOutputTokens": max_output_tokens}
    if response_schema:
        generation_config.update({
            "responseMimeType": "application/json",
            "responseSchema": _gemini_schema(response_schema),
        })
    body = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": contents,
        "generationConfig": generation_config,
    }
    data, model = _gemini_post(body, models)
    candidates = data.get("candidates") or []
    if not candidates:
        reason = (data.get("promptFeedback") or {}).get("blockReason") or "no candidate returned"
        raise RuntimeError(f"Gemini returned no response: {reason}")
    if candidates[0].get("finishReason") == "MAX_TOKENS":
        log.warning("Gemini reply was cut off by the output token limit")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(part.get("text", "") for part in parts)
    if not text:
        raise RuntimeError("Gemini returned an empty response")
    return text, model


def _gemini_chat_contents(messages: list[dict], image_jpeg: bytes | None = None) -> list[dict]:
    latest_user = next((i for i in range(len(messages) - 1, -1, -1) if messages[i]["role"] == "user"), None)
    contents = []
    for i, message in enumerate(messages):
        role = "model" if message["role"] == "assistant" else "user"
        parts = [{"text": message["content"]}]
        if image_jpeg and i == latest_user:
            parts.append({"inlineData": {"mimeType": "image/jpeg", "data": _small_jpeg_b64(image_jpeg)}})
        contents.append({"role": role, "parts": parts})
    return contents


def ai_ready() -> bool:
    p = active_provider()
    return p == "anthropic" or (p == "gemini" and bool(settings.gemini_api_key))


def status_summary() -> dict:
    p = active_provider()
    ready = ai_ready()
    model = settings.gemini_model if p == "gemini" else settings.anthropic_model if p == "anthropic" else None
    return {
        "provider": provider_name(),
        "ai_ready": ready,
        "vision_ready": ready,
        "chat_model": model,
        "vision_model": model,
        "model_status": "ready" if ready else "missing" if p == "gemini" else "disabled",
        "model_detail": "Set GEMINI_API_KEY in .env to enable Gemini Flash." if p == "gemini" and not ready else "",
    }


def _unavailable_note() -> str:
    if active_provider() == "gemini":
        if not settings.gemini_api_key:
            return "Gemini API key is missing; add GEMINI_API_KEY to .env. "
        return "Gemini Flash is unavailable, so this is an offline estimate. "
    return "The AI service is unavailable, so this is an offline estimate. "


def _small_jpeg_b64(image_jpeg: bytes, max_side: int = 1024) -> str:
    """Smaller images upload faster and cost fewer tokens, with little loss for leaf diagnosis."""
    try:
        img = Image.open(io.BytesIO(image_jpeg)).convert("RGB")
        img.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return base64.b64encode(image_jpeg).decode()


def _parse_json(content: str) -> dict:
    return json.loads(content[content.index("{"): content.rindex("}") + 1])


# ---------------------------------------------------------------- prompts

def _analysis_system(ctx: str, lang: str) -> str:
    return (
        "You are Crop Advisor AI, an experienced agronomist and plant pathologist helping smallholder farmers. "
        "Analyse the plant photo carefully: identify the crop, growth stage, health, any diseases, pests, nutrient "
        "or water problems, harvest readiness and market quality. Be specific about visual evidence and honest about "
        "uncertainty (use lower confidence when the photo is unclear). Write for farmers: plain, practical, actionable. "
        "health_score: 90-100 healthy, 60-89 mild, 40-59 moderate, below 40 severe. Give 3-5 treatment steps when "
        "there is a problem, an empty list when healthy. "
        f"Write all text fields in {LANGUAGES.get(lang, 'English')}, but keep enum values in English. {SAFETY}\n\n"
        f"Trusted reference knowledge:\n{ctx}"
    )


def _analysis_user(crop_hint, notes, stats) -> str:
    return (
        f"Farmer's crop: {crop_hint or 'not specified'}\n"
        f"Farmer's notes: {notes or 'none'}\n"
        f"Measured colour proportions of plant pixels (approximate): {json.dumps(stats)}\n"
        "Analyse this photo."
    )


def _chat_system(ctx: str, analysis: dict | None, lang: str) -> str:
    system = (
        "You are Crop Advisor AI Assistant, a friendly agronomist helping farmers with plant disease identification, "
        "nutrient management, watering, harvest timing, market readiness and improving yields. Give practical, "
        "step-by-step answers in short paragraphs or bullet lists using **bold** for key points. Keep answers focused "
        "(usually under 250 words). Ask a clarifying question when key details (crop, symptoms, location/climate, "
        f"growth stage) are missing. Reply in {LANGUAGES.get(lang, 'English')}. {SAFETY}\n\n"
        f"Trusted reference knowledge (prefer it over guesses):\n{ctx}"
    )
    if analysis:
        slim = {k: analysis.get(k) for k in ("crop", "health_status", "health_score", "growth_stage", "summary", "issues", "harvest")}
        system += f"\n\nThe farmer's plant analysis (from their photo):\n{json.dumps(slim, ensure_ascii=False)}"
    return system


# ---------------------------------------------------------------- result clean-up (open models can be loose)

def _num(v, lo, hi, default):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def normalize(r: dict, crop_hint: str | None) -> dict:
    out = dict(r or {})
    out["is_plant"] = bool(out.get("is_plant", True))
    out["crop"] = str(out.get("crop") or crop_hint or "Unknown crop").strip()
    conf = _num(out.get("crop_confidence"), 0, 100, 0.7)
    out["crop_confidence"] = conf / 100 if conf > 1 else conf
    score = int(_num(out.get("health_score"), 0, 100, 70))
    out["health_score"] = score
    if out.get("health_status") not in ("healthy", "mild", "moderate", "severe"):
        out["health_status"] = "healthy" if score >= 90 else "mild" if score >= 60 else "moderate" if score >= 40 else "severe"
    out["summary"] = str(out.get("summary") or "")
    stage = str(out.get("growth_stage") or "").lower()
    out["growth_stage"] = stage if stage in STAGES else kb.normalize_stage(stage)
    issues = []
    for i in out.get("issues") or []:
        if not isinstance(i, dict) or not i.get("name"):
            continue
        c = _num(i.get("confidence"), 0, 100, 0.6)
        issues.append({
            "name": str(i["name"]),
            "type": i.get("type") if i.get("type") in ("disease", "pest", "nutrient", "water", "environmental", "other") else "other",
            "confidence": c / 100 if c > 1 else c,
            "severity": i.get("severity") if i.get("severity") in ("low", "medium", "high") else "medium",
            "description": str(i.get("description") or ""),
            "evidence": str(i.get("evidence") or ""),
        })
    out["issues"] = issues
    out["treatment"] = [
        {"title": str(t.get("title") or f"Step {n + 1}"), "description": str(t.get("description") or "")}
        for n, t in enumerate(x for x in (out.get("treatment") or []) if isinstance(x, dict))
    ]
    out["prevention"] = [str(p) for p in out.get("prevention") or [] if p]
    out["yield_tips"] = [str(p) for p in out.get("yield_tips") or [] if p]
    out["follow_up_questions"] = [str(p) for p in out.get("follow_up_questions") or [] if p][:3]
    w = out.get("watering") if isinstance(out.get("watering"), dict) else {}
    out["watering"] = {k: str(w.get(k) or "—") for k in ("frequency", "amount", "advice")}
    h = out.get("harvest") if isinstance(out.get("harvest"), dict) else {}
    out["harvest"] = {
        "ready": bool(h.get("ready", False)),
        "readiness_percent": int(_num(h.get("readiness_percent"), 0, 100, 0)),
        "estimated_days": str(h.get("estimated_days") or "—"),
        "signs": str(h.get("signs") or ""),
        "advice": str(h.get("advice") or ""),
    }
    m = out.get("market") if isinstance(out.get("market"), dict) else {}
    grade = str(m.get("quality_grade") or "N/A").upper()
    out["market"] = {"quality_grade": grade if grade in ("A", "B", "C", "N/A") else "N/A", "advice": str(m.get("advice") or "")}
    return out


# ---------------------------------------------------------------- analysis

def analyze(image_jpeg: bytes, stats: dict, crop_hint: str | None, notes: str | None, lang: str = "en") -> dict:
    """Photo → structured analysis. Order: Gemini (or Claude) → offline knowledge base."""
    crop_key = kb.normalize_crop(crop_hint)
    provider = active_provider()
    result = None
    if provider == "gemini" and settings.gemini_api_key:
        try:
            raw, model = _gemini_analysis(image_jpeg, stats, crop_hint, notes, lang)
            result = normalize(raw, crop_hint)
            result["engine"] = f"gemini:{model}"
        except Exception as exc:
            log.exception("Gemini analysis failed: %s", exc)
    elif provider == "anthropic":
        try:
            result = normalize(_claude_analysis(image_jpeg, stats, crop_hint, notes, lang), crop_hint)
            result["engine"] = provider_name()
        except Exception as exc:
            log.exception("Claude analysis failed: %s", exc)
    if result is None:
        result = offline_analysis(stats, crop_hint, notes)
        result["engine"] = "offline-knowledge-base"
        if provider != "offline":
            result["summary"] = _unavailable_note() + result["summary"]
    crop_key = kb.normalize_crop(result.get("crop")) or crop_key
    result["fertilizer"] = kb.fertilizer_plan(crop_key or "tomato", result.get("growth_stage"),
                                              [i["name"] for i in result.get("issues", [])])
    result["colour_stats"] = stats
    result["expert_check"] = expert_check(result)
    result["sources"] =[{"id": d["id"], "title": d["title"]} for d in
                         kb.search(" ".join(i["name"] for i in result.get("issues", [])) or "harvest yield", crop_key, 3)]
    return result


def _gemini_analysis(image_jpeg, stats, crop_hint, notes, lang) -> dict:
    ctx, _ = kb.context_block(f"{crop_hint or ''} {notes or ''} leaf spots yellow disease harvest", kb.normalize_crop(crop_hint), k=3)
    text, model = _gemini_generate(
        [{
            "role": "user",
            "parts": [
                {"text": _analysis_user(crop_hint, notes, stats)},
                {"inlineData": {"mimeType": "image/jpeg", "data": _small_jpeg_b64(image_jpeg)}},
            ],
        }],
        _analysis_system(ctx, lang) + "\nRespond only with JSON that matches the schema.",
        response_schema=ANALYSIS_TOOL["input_schema"],
        temperature=0.2,
        max_output_tokens=8192,  # thinking tokens count toward this limit; too low truncates the JSON
    )
    return _parse_json(text), model


# ---------------------------------------------------------------- expert check

# Below this confidence, a diagnosis is a guess the farmer should confirm before buying or spraying anything.
LOW_CONFIDENCE = 0.5


def expert_check(result: dict) -> dict:
    """Flag analyses a farmer should confirm with an extension officer or agronomist before acting.

    Wrong treatment advice costs money and can harm crops, so severe or uncertain results say so."""
    found = []  # (code the apps translate, English text)
    issues = result.get("issues") or []
    if result.get("health_status") == "severe" or any(i.get("severity") == "high" for i in issues):
        found.append(("severe", "A serious problem was found that can spread or cause heavy losses."))
    if issues and max(i.get("confidence", 0) for i in issues) < LOW_CONFIDENCE:
        found.append(("unsure_problem", "The AI is not sure what the problem is."))
    if result.get("crop_confidence", 1) < LOW_CONFIDENCE:
        found.append(("unsure_crop", "The AI is not sure which crop this is, so the advice may not fit."))
    if str(result.get("engine", "")).startswith("offline"):
        found.append(("offline", "This is an estimate from leaf colour only; the AI model was not available."))
    return {"recommended": bool(found), "codes": [c for c, _ in found], "reasons": [r for _, r in found]}


# ---------------------------------------------------------------- plant check

PLANT_CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "is_plant": {"type": "boolean", "description": "True only if a living plant or crop (leaves, stems, fruit, seedlings, a field of crops) is clearly visible."},
        "reason": {"type": "string", "description": "One short sentence saying what the photo shows."},
    },
    "required": ["is_plant", "reason"],
}

NOT_A_PLANT_MESSAGE = (
    "This photo doesn't show a plant, so it wasn't analysed. "
    "Take a close, well-lit photo of the plant's leaves, stem or fruit and try again."
)

# Below this share of plant-coloured pixels the offline check treats a photo as "no plant".
MIN_PLANT_COVERAGE = 0.08


def check_plant(image_jpeg: bytes, stats: dict) -> tuple[bool, str]:
    """Decide whether a photo shows a plant BEFORE analysing it. Returns (is_plant, what the photo shows).

    Uses a fast Gemini model when available; otherwise (or if that call fails) the measured share of
    plant-coloured pixels."""
    if active_provider() == "gemini" and settings.gemini_api_key:
        try:
            text, _ = _gemini_generate(
                [{"role": "user", "parts": [
                    {"text": "Does this photo show a plant or crop? Pests or disease ON a plant count as a plant. "
                             "Soil, tools, empty pots, people, animals, documents or screens without a plant do not."},
                    {"inlineData": {"mimeType": "image/jpeg", "data": _small_jpeg_b64(image_jpeg, 512)}},
                ]}],
                "You check farm photos before they are analysed. Answer only with JSON that matches the schema.",
                response_schema=PLANT_CHECK_SCHEMA,
                temperature=0,
                max_output_tokens=1024,
                models=list(dict.fromkeys([settings.gemini_check_model, *_gemini_models()])),
            )
            verdict = _parse_json(text)
            return bool(verdict.get("is_plant")), str(verdict.get("reason") or "")
        except Exception as exc:
            log.warning("Plant check with Gemini failed, using leaf-colour check: %s", exc)
    return stats.get("plant_coverage", 0) >= MIN_PLANT_COVERAGE, ""


def _claude_analysis(image_jpeg, stats, crop_hint, notes, lang) -> dict:
    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    ctx, _ = kb.context_block(f"{crop_hint or ''} {notes or ''} leaf spots yellow disease harvest", kb.normalize_crop(crop_hint), k=4)
    msg = client.messages.create(
        model=settings.anthropic_model, max_tokens=4000, system=_analysis_system(ctx, lang),
        tools=[ANALYSIS_TOOL], tool_choice={"type": "tool", "name": ANALYSIS_TOOL["name"]},
        messages=[{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(image_jpeg).decode()}},
            {"type": "text", "text": _analysis_user(crop_hint, notes, stats)},
        ]}],
    )
    for block in msg.content:
        if block.type == "tool_use":
            return dict(block.input)
    raise RuntimeError("Model did not return a structured analysis")


# ---------------------------------------------------------------- offline fallback

def offline_analysis(stats: dict, crop_hint: str | None, notes: str | None) -> dict:
    """Colour-heuristic estimate used when no AI key is configured."""
    crop_key = kb.normalize_crop(crop_hint) or kb.detect_crop(notes or "")
    crop_name = kb.crops()[crop_key]["name"] if crop_key else (crop_hint or "Unknown crop")
    y, b, r = stats["yellow_ratio"], stats["brown_ratio"], stats["red_ratio"]
    issues, treatment = [], []
    if stats["plant_coverage"] < MIN_PLANT_COVERAGE:
        return _not_plant(crop_name)
    if y > 0.15:
        issues.append({"name": "Leaf yellowing (possible nitrogen deficiency or overwatering)", "type": "nutrient",
                       "confidence": min(0.75, 0.35 + y), "severity": "high" if y > 0.35 else "medium",
                       "description": "A noticeable share of the foliage is yellow. If older, lower leaves are yellowing evenly, nitrogen is the most likely cause; if soil is wet, check for overwatering.",
                       "evidence": f"About {round(y * 100)}% of plant area is yellow."})
        treatment += [
            {"title": "Check the pattern", "description": "Note whether yellowing starts on old or new leaves and whether there are spots — see the 'Why leaves turn yellow' guide."},
            {"title": "Check soil moisture", "description": "Push a finger 5 cm into the soil. If wet, let it dry before watering again and improve drainage."},
            {"title": "Feed if nitrogen-hungry", "description": "Side-dress with a nitrogen fertilizer or compost and water it in; new leaves should green up within 1–2 weeks."},
        ]
    if b > 0.10:
        issues.append({"name": "Brown spots or lesions (possible fungal leaf spot / blight)", "type": "disease",
                       "confidence": min(0.7, 0.3 + b), "severity": "high" if b > 0.3 else "medium",
                       "description": "Brown areas on leaves often indicate fungal diseases such as early blight or leaf spot, especially after wet weather.",
                       "evidence": f"About {round(b * 100)}% of plant area is brown."})
        treatment += [
            {"title": "Identify the Problem", "description": "Carefully examine the affected plants to understand the full extent of the issue. Look for patterns such as rings, halos or fuzzy growth under leaves."},
            {"title": "Remove infected leaves", "description": "Cut off and destroy affected leaves (do not compost). Disinfect tools afterwards."},
            {"title": "Improve airflow and watering", "description": "Water at the base in the morning, mulch, and prune lower leaves to keep foliage dry."},
            {"title": "Protect healthy growth", "description": "If spreading, apply a protectant fungicide registered for your crop (e.g., copper-based), following the label."},
        ]
    score = int(max(5, min(98, 100 - y * 120 - b * 160)))
    status = "healthy" if score >= 80 else "mild" if score >= 60 else "moderate" if score >= 40 else "severe"
    ripe = r > 0.08 and crop_key in ("tomato", "pepper", None)
    stage = "fruiting" if r > 0.03 else "vegetative"
    readiness = int(min(100, r * 400)) if ripe else 15 if stage == "fruiting" else 0
    w = kb.crops()[crop_key or "tomato"]["watering"]
    return {
        "is_plant": True,
        "crop": crop_name,
        "crop_confidence": 0.9 if crop_key else 0.3,
        "health_status": status,
        "health_score": score,
        "summary": ("Offline estimate based on leaf colour. " +
                    ("The plant looks generally healthy." if not issues else
                     f"Possible problems found: {', '.join(i['name'].split(' (')[0].lower() for i in issues)}.") +
                    " Connect the AI model for a full diagnosis."),
        "growth_stage": stage,
        "issues": issues,
        "treatment": treatment,
        "prevention": [
            "Rotate crops — avoid planting the same family in the same bed for 2–3 years.",
            "Water at the base in the morning and mulch to stop soil splash.",
            "Scout plants weekly and remove problem leaves early.",
        ],
        "watering": {"frequency": "2–3 deep waterings per week", "amount": f"{w['weekly_mm'][0]}–{w['weekly_mm'][1]} mm per week",
                     "advice": w["summary"]},
        "harvest": {"ready": ripe and readiness >= 60, "readiness_percent": readiness,
                    "estimated_days": "Ready now" if ripe and readiness >= 60 else "Check again in 1–2 weeks",
                    "signs": kb.crops()[crop_key or "tomato"]["harvest"],
                    "advice": "Harvest in the cool of the morning and keep produce shaded."},
        "market": {"quality_grade": "A" if score >= 80 else "B" if score >= 55 else "C",
                   "advice": "Grade produce by size and blemishes; sell blemished produce for processing or local markets."},
        "yield_tips": ["Test your soil and fertilize to the result.", "Mulch to keep moisture even.",
                       "Keep the first 6 weeks weed-free."],
        "follow_up_questions": ["How often should I water these plants?", "What fertilizer should I use now?"],
    }


def _not_plant(crop_name: str) -> dict:
    return {
        "is_plant": False, "crop": crop_name, "crop_confidence": 0.1, "health_status": "mild", "health_score": 0,
        "summary": "No plant could be detected in this photo. Take a close, well-lit photo of the affected leaves or fruit.",
        "growth_stage": "vegetative", "issues": [], "treatment": [], "prevention": [],
        "watering": {"frequency": "—", "amount": "—", "advice": "—"},
        "harvest": {"ready": False, "readiness_percent": 0, "estimated_days": "Not applicable", "advice": "—"},
        "market": {"quality_grade": "N/A", "advice": "—"}, "yield_tips": [], "follow_up_questions": [],
    }


# ---------------------------------------------------------------- chat

def chat(messages: list[dict], analysis: dict | None, image_jpeg: bytes | None, lang: str = "en") -> dict:
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    crop_key = kb.normalize_crop((analysis or {}).get("crop")) or kb.detect_crop(last_user)
    ctx, docs = kb.context_block(last_user, crop_key, k=3)
    sources = [{"id": d["id"], "title": d["title"]} for d in docs]
    provider = active_provider()
    if not ai_ready():
        prefix = "" if provider == "offline" else _unavailable_note().replace("this is an offline estimate", "here's guidance from the knowledge base") + "\n\n"
        return {"reply": prefix + _offline_reply(last_user, crop_key, analysis, docs), "sources": sources, "provider": "offline-knowledge-base"}

    hist = [{"role": m["role"], "content": m["content"]} for m in messages[-20:] if m["content"].strip()]
    while hist and hist[0]["role"] != "user":
        hist.pop(0)
    system = _chat_system(ctx, analysis, lang)
    used = provider_name()
    try:
        if provider == "gemini":
            text, model = _gemini_generate(
                _gemini_chat_contents(hist, image_jpeg),
                system,
                temperature=0.4,
                max_output_tokens=2048,
            )
            text = text.strip()
            used = f"gemini:{model}"
        else:
            import anthropic

            if image_jpeg and hist:
                hist[-1] = {"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(image_jpeg).decode()}},
                    {"type": "text", "text": hist[-1]["content"]}]}
            msg = anthropic.Anthropic(api_key=settings.anthropic_api_key).messages.create(
                model=settings.anthropic_model, max_tokens=1200, system=system, messages=hist)
            text = "".join(b.text for b in msg.content if b.type == "text").strip()
        if not text:
            raise RuntimeError("empty reply")
    except Exception as exc:
        log.exception("%s chat failed: %s", provider, exc)
        text = "The AI model is unavailable right now, so here's guidance from the knowledge base.\n\n" + \
               _offline_reply(last_user, crop_key, analysis, docs)
        return {"reply": text, "sources": sources, "provider": "offline-knowledge-base"}
    return {"reply": text, "sources": sources, "provider": used}


def _offline_reply(question: str, crop_key: str | None, analysis: dict | None, docs: list[dict]) -> str:
    q = question.lower()
    parts = []
    if analysis:
        parts.append(f"Based on your latest scan ({analysis.get('crop')}, health {analysis.get('health_score')}/100): {analysis.get('summary', '')}")
    if crop_key and any(w in q for w in ("water", "irrigat")):
        parts.append(f"**Watering {kb.crops()[crop_key]['name']}:** {kb.crops()[crop_key]['watering']['summary']}")
    if crop_key and any(w in q for w in ("harvest", "ready", "ripe", "pick")):
        parts.append(f"**Harvest signs for {kb.crops()[crop_key]['name']}:** {kb.crops()[crop_key]['harvest']}")
    if crop_key and any(w in q for w in ("fertil", "feed", "npk", "nutrient")):
        plan = kb.fertilizer_plan(crop_key, (analysis or {}).get("growth_stage"))
        parts.append(f"**Fertilizer ({plan['stage']} stage):** {plan['recommended']} — {plan['application']} {plan['safety']}")
    if docs:
        parts.append(f"**{docs[0]['title']}**\n{docs[0]['content']}")
    if len(docs) > 1:
        parts.append("Related guides: " + ", ".join(d["title"] for d in docs[1:]) + ".")
    if not parts:
        parts.append("I can help with plant diseases, yellow leaves, leaf spots, watering, fertilizer, harvest timing and improving yields. "
                     "Tell me your crop, what you see on the plant and its growth stage — or attach a photo.")
    return "\n\n".join(parts)
