"""Copy the screen-text translations from the website to the mobile app, so both apps say the same thing.

The website's files are the source: web/src/i18n/locales/*.json -> mobile/src/i18n/locales/
    python scripts/sync_translations.py           copy them
    python scripts/sync_translations.py --check   fail if the mobile copies are out of date (used in CI)
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "web" / "src" / "i18n" / "locales"
DST = ROOT / "mobile" / "src" / "i18n" / "locales"


def main() -> int:
    check = "--check" in sys.argv
    DST.mkdir(parents=True, exist_ok=True)
    stale = []
    for src in sorted(SRC.glob("*.json")):
        dst = DST / src.name
        if not dst.exists() or dst.read_bytes() != src.read_bytes():
            stale.append(src.name)
            if not check:
                shutil.copyfile(src, dst)
    extra = sorted(p.name for p in DST.glob("*.json") if not (SRC / p.name).exists())
    if check:
        if stale or extra:
            print(f"Mobile translations are out of date: {', '.join(stale + extra)}. Run: python scripts/sync_translations.py")
            return 1
        print("Mobile translations match the website.")
        return 0
    for name in extra:
        (DST / name).unlink()
    print(f"Copied {len(stale)} file(s); removed {len(extra)}." if stale or extra else "Already in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
