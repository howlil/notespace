"""Temporary deployed asset probe. Remove after diagnosis."""
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip("/") + "/"
headers = {"User-Agent": "notespace-ci-probe", "Cache-Control": "no-cache"}

with urllib.request.urlopen(urllib.request.Request(base, headers=headers), timeout=15) as response:
    html = response.read().decode("utf-8", errors="replace")
    refs = re.findall(r'(?:href|src)=["\']([^"\']+)["\']', html, re.IGNORECASE)
    assets = list(dict.fromkeys(urllib.parse.urljoin(base, ref) for ref in refs if "/assets/" in ref))
    print("ROOT", response.status, response.headers.get("Last-Modified"), "ASSETS", len(assets))

if not assets:
    raise RuntimeError("No built assets found in production HTML")

for url in assets:
    separator = "&" if "?" in url else "?"
    bypass = f"{url}{separator}probe={time.time_ns()}"
    try:
        with urllib.request.urlopen(urllib.request.Request(bypass, headers=headers), timeout=15) as response:
            body = response.read(64)
            print("ASSET", url, response.status, response.headers.get("Content-Type"), response.headers.get("CF-Cache-Status"), response.headers.get("Last-Modified"), len(body))
    except urllib.error.HTTPError as exc:
        body = exc.read()
        print("ASSET", url, exc.code, exc.headers.get("Content-Type"), exc.headers.get("CF-Cache-Status"), exc.headers.get("Last-Modified"), len(body))

raise RuntimeError("diagnostic probe complete")
