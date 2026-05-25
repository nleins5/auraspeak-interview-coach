"""
Vercel Python entrypoint for the Interview Coach FastAPI backend.
"""
import os
import sys
import traceback

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("VERCEL", "1")

try:
    from app.main import app as application
except Exception as exc:
    print(f"Import error: {exc}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    raise

handler = application
app = application
