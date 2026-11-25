"""Curated agricultural knowledge base + lightweight keyword retrieval.

The assistant grounds its answers in these entries (passed to the LLM as context),
and they are also used directly when the app runs without an AI key.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

KB_DIR = Path(__file__).parent / "knowledge"
STAGES = ["seedling", "vegetative", "flowering", "fruiting", "mature"]

CROP_ALIASES = {
    "tomato": ["tomato", "tomatoes"],
    "maize": ["maize", "corn", "mealie", "mealies"],
    "potato": ["potato", "potatoes"],
    "pepper": ["pepper", "peppers", "chilli", "chili", "capsicum"],
    "beans": ["bean", "beans"],
    "cabbage": ["cabbage", "cabbages", "brassica"],
    "wheat": ["wheat"],
    "spinach": ["spinach", "swiss chard", "chard"],
}

_STOP = set(
    "a an the my our your of on in to for is are am be do does how what why when which "
    "can could should would i we you it its this these those and or with about there their "
    "from at by as so if not no yes have has had get got".split()
)


@lru_cache
def crops() -> dict:
    return json.loads((KB_DIR / "crops.json").read_text(encoding="utf-8"))


@lru_cache
def guides() -> list[dict]:
    return json.loads((KB_DIR / "guides.json").read_text(encoding="utf-8"))


def normalize_crop(name: str | None) -> str | None:
    if not name:
        return None
    n = name.strip().lower()
    for key, aliases in CROP_ALIASES.items():
        if n == key or any(a in n for a in aliases):
            return key
    return None


def detect_crop(text: str) -> str | None:
    t = text.lower()
    for key, aliases in CROP_ALIASES.items():
        if any(re.search(rf"\b{re.escape(a)}\b", t) for a in aliases):
            return key
    return None


def normalize_stage(stage: str | None) -> str:
    if not stage:
        return "vegetative"
    s = stage.lower()
    for st in STAGES:
        if st in s:
            return st
    if "seed" in s or "germin" in s:
        return "seedling"
    if "flower" in s or "bloom" in s or "tassel" in s or "silk" in s:
        return "flowering"
    if "fruit" in s or "pod" in s or "grain" in s or "tuber" in s or "head" in s:
        return "fruiting"
    if "ripe" in s or "harvest" in s or "matur" in s:
        return "mature"
    return "vegetative"


def _tokens(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z]+", text.lower()) if w not in _STOP and len(w) > 2]


def search(query: str, crop: str | None = None, k: int = 3) -> list[dict]:
    """Rank guides by tag/title/content overlap with the query, boosting the matching crop."""
    q = query.lower()
    qtokens = set(_tokens(query))
    crop = crop or detect_crop(query)
    scored = []
    for g in guides():
        score = 0.0
        for tag in g["tags"]:
            if " " in tag and tag in q:
                score += 4
            elif tag in qtokens or any(t.startswith(tag) or tag.startswith(t) for t in qtokens if len(t) > 3):
                score += 2
        score += 1.5 * len(qtokens & set(_tokens(g["title"])))
        score += 0.1 * len(qtokens & set(_tokens(g["content"])))
        if crop and g["crop"] == crop:
            score += 2
        elif crop and g["crop"] not in ("general", crop):
            score -= 2
        if score > 0:
            scored.append((score, g))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [g for _, g in scored[:k]]


def crop_profile_text(crop: str | None) -> str:
    if not crop or crop not in crops():
        return ""
    c = crops()[crop]
    fert = "; ".join(f"{st}: {v['name']} ({'-'.join(map(str, v['npk']))})" for st, v in c["fertilizer"].items())
    return (
        f"CROP PROFILE — {c['name']}\n"
        f"Watering: {c['watering']['summary']}\n"
        f"Fertilizer by stage: {fert}\n"
        f"Harvest: {c['harvest']} Typical days to harvest: {c['days_to_harvest'][0]}–{c['days_to_harvest'][1]}."
    )


def context_block(query: str, crop: str | None = None, k: int = 3) -> tuple[str, list[dict]]:
    docs = search(query, crop, k)
    parts = [crop_profile_text(crop or detect_crop(query))]
    parts += [f"GUIDE — {d['title']}\n{d['content']}" for d in docs]
    return "\n\n".join(p for p in parts if p), docs


def fertilizer_plan(crop: str | None, stage: str | None, issues: list[str] | None = None) -> dict:
    """Deterministic, knowledge-based fertilizer recommendation."""
    key = normalize_crop(crop) or "tomato"
    st = normalize_stage(stage)
    profile = crops()[key]
    rec = dict(profile["fertilizer"][st])
    if rec["npk"] == [0, 0, 0] or rec["name"] in ("—", "None"):
        # fall back to the closest stage that actually has a feed
        for alt in ["vegetative", "flowering", "seedling"]:
            if profile["fertilizer"][alt]["npk"] != [0, 0, 0]:
                note = f"No routine feed is needed at the {st} stage; shown here is the {alt}-stage plan for reference."
                rec = dict(profile["fertilizer"][alt]) | {"note": note}
                break
    issues_l = " ".join(issues or []).lower()
    adjustments = []
    if "nitrogen" in issues_l or "yellow" in issues_l or "chlorosis" in issues_l:
        adjustments.append("Leaves look nitrogen-hungry: add a light nitrogen side-dress (e.g., LAN/CAN) and re-check new growth in 10–14 days.")
    if "magnesium" in issues_l:
        adjustments.append("Interveinal yellowing on older leaves: spray Epsom salt (about 20 g/L) every 2 weeks.")
    if "potassium" in issues_l:
        adjustments.append("Scorched leaf edges: switch to a higher-potassium product.")
    if "blossom" in issues_l or "calcium" in issues_l:
        adjustments.append("Blossom-end rot: keep watering even and apply calcium nitrate; avoid ammonium-heavy fertilizers.")
    if "blight" in issues_l or "spot" in issues_l or "fung" in issues_l:
        adjustments.append("Disease present: avoid heavy nitrogen, which produces soft, disease-prone growth.")
    return {
        "crop": profile["name"],
        "stage": st,
        "recommended": rec["name"],
        "npk": {"n": rec["npk"][0], "p": rec["npk"][1], "k": rec["npk"][2]},
        "application": rec["application"],
        "timing": rec["timing"],
        "note": rec.get("note"),
        "adjustments": adjustments,
        "schedule": [
            {"stage": s, "product": v["name"], "npk": "-".join(map(str, v["npk"])), "timing": v["timing"]}
            for s, v in profile["fertilizer"].items()
            if v["name"] not in ("—", "None")
        ],
        "safety": "Rates depend on your soil. Get a soil test where possible and follow the product label. Water in granular fertilizer and keep it off leaves and stems.",
    }
