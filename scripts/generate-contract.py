"""Export the backend OpenAPI and generate frontend types from locked tools."""
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://unused:unused@localhost/unused")
sys.path.insert(0, str(ROOT / "backend"))
from app.main import app

schema = ROOT / "docs" / "openapi.json"
schema.write_text(json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
command = "npm.cmd" if os.name == "nt" else "npm"
subprocess.run([command, "exec", "--", "openapi-typescript", "-o", "src/lib/api.generated.ts"], cwd=ROOT / "frontend", input=schema.read_bytes(), check=True)

