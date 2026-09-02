"""Temporary deployed asset probe. Remove after diagnosis."""
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip("/") + "/"
headers = {"User-Agent": "notespace-ci-probe", "Cache-Control": "no-cache"}

with urllib.request.urlopen(urllib.request.Request(base, headers=headers), timeout=15) as response:
    html = response.read().decode("utf-8", errors="replace")
    print("ROOT", response.status, response.headers.get("Content-Type"), response.headers.get("Cache-Control"))

links = re.findall(r'<link[^>]+href=["\']([^"\']+)["\'][^>]*>', html, re.IGNORECASE)
stylesheets = [urllib.parse.urljoin(base, href) for href in links if ".css" in href]
if not stylesheets:
    raise RuntimeError("No CSS links found in production HTML")

for url in stylesheets:
    print("CSS_URL", url)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as response:
            body = response.read()
            print("CSS_RESPONSE", response.status, response.headers.get("Content-Type"), response.headers.get("Cache-Control"), len(body))
    except urllib.error.HTTPError as exc:
        print("CSS_RESPONSE", exc.code, exc.headers.get("Content-Type"), exc.headers.get("Cache-Control"), len(exc.read()))
