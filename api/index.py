"""
Vercel serverless function for Voice Function.
Direct wrapper for FastAPI app with proper ASGI handling.
"""
import os
import sys
import traceback

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)
os.chdir(root_dir)

# Set environment to skip heavy initialization
os.environ.setdefault('VERCEL', '1')

# Catch import errors
try:
    from app.main import app as application
    print("App imported successfully", file=sys.stderr)
except Exception as e:
    print(f"Import error: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    raise

# Export handler for Vercel Python runtime
handler = application
app = application
