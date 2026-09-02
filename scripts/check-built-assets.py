"""Verify prerendered HTML only references files emitted into dist/client."""
from pathlib import Path
import re
import sys
import urllib.parse

root = Path(sys.argv[1] if len(sys.argv) > 1 else "apps/web/dist/client")
index = root / "index.html"
html = index.read_text(encoding="utf-8")
refs = re.findall(r'(?:href|src)=["\']([^"\']+)["\']', html, re.IGNORECASE)
assets = list(dict.fromkeys(ref for ref in refs if ref.startswith("/assets/")))
if not assets:
    raise RuntimeError(f"No built assets referenced by {index}")

missing = []
for ref in assets:
    clean = urllib.parse.urlsplit(ref).path.lstrip("/")
    target = root / clean
    print("BUILT_ASSET", ref, "EXISTS" if target.is_file() else "MISSING")
    if not target.is_file():
        missing.append(ref)

if missing:
    raise RuntimeError("Prerendered HTML references missing assets: " + ", ".join(missing))
