"""Image preprocessing and simple colour measurements.

The colour measurements are sent to the AI model as extra evidence, and they drive the
offline (no API key) estimate.
"""
from __future__ import annotations

import colorsys
import io

from PIL import Image, ImageOps

MAX_SIDE = 1568  # good size for vision models


def prepare(data: bytes) -> tuple[bytes, Image.Image]:
    """Validate, auto-rotate, downscale and re-encode an upload as JPEG."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return buf.getvalue(), img


def colour_stats(img: Image.Image) -> dict:
    small = img.copy()
    small.thumbnail((128, 128))
    counts = {"green": 0, "yellow": 0, "brown": 0, "red": 0, "dark": 0, "other": 0}
    total = 0
    raw = small.tobytes()
    for i in range(0, len(raw), 3):
        r, g, b = raw[i], raw[i + 1], raw[i + 2]
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        deg = h * 360
        total += 1
        if v < 0.18:
            counts["dark"] += 1
        elif s < 0.18:
            counts["other"] += 1  # greys / whites / sky
        elif 70 <= deg <= 170:
            counts["green"] += 1
        elif 45 <= deg < 70:
            counts["yellow"] += 1
        elif 15 <= deg < 45:
            counts["brown" if v < 0.7 else "yellow"] += 1
        elif deg < 15 or deg >= 340:
            counts["red"] += 1
        else:
            counts["other"] += 1
    plant = max(1, counts["green"] + counts["yellow"] + counts["brown"] + counts["red"])
    return {
        "plant_coverage": round(plant / max(1, total), 3),
        "green_ratio": round(counts["green"] / plant, 3),
        "yellow_ratio": round(counts["yellow"] / plant, 3),
        "brown_ratio": round(counts["brown"] / plant, 3),
        "red_ratio": round(counts["red"] / plant, 3),
        "dark_ratio": round(counts["dark"] / max(1, total), 3),
    }
