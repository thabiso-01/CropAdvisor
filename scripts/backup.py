"""Back up the Crop Advisor database and uploaded plant photos from the running Docker containers.

    python scripts/backup.py            -> backups/<date-time>/crop_advisor.sql + uploads/

Restore (replaces the current data):
    docker compose exec -T db psql -U crop -d crop_advisor < backups/<date-time>/crop_advisor.sql
    docker compose cp backups/<date-time>/uploads/. api:/data/uploads

Run it from the project folder while `docker compose up` is running. Uses only the Python
standard library and the docker CLI.
"""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    out = ROOT / "backups" / datetime.now().strftime("%Y-%m-%d_%H%M%S")
    out.mkdir(parents=True)

    sql = out / "crop_advisor.sql"
    with sql.open("wb") as f:
        dump = subprocess.run(
            ["docker", "compose", "exec", "-T", "db", "pg_dump", "-U", "crop", "--clean", "--if-exists", "crop_advisor"],
            cwd=ROOT, stdout=f, stderr=subprocess.PIPE,
        )
    if dump.returncode != 0:
        print("Database backup failed. Is Docker running (docker compose up -d)?\n" + dump.stderr.decode(errors="replace"))
        return 1

    photos = subprocess.run(["docker", "compose", "cp", "api:/data/uploads", str(out / "uploads")],
                            cwd=ROOT, capture_output=True, text=True)
    if photos.returncode != 0:
        print("Photo backup failed:\n" + photos.stderr)
        return 1

    n_photos = sum(1 for p in (out / "uploads").glob("*.jpg"))
    print(f"Backed up the database ({sql.stat().st_size // 1024} KB) and {n_photos} photos to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
