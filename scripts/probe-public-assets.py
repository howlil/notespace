"""Temporary deployed asset probe. Remove after diagnosis."""
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip("/") + "/"
headers = {"User-Agent": "notespace-ci-probe", "Cache-Control": "no-cache"}
interesting = ("Date", "Server", "Via", "Age", "CF-Cache-Status", "Cache-Control", "ETag", "Last-Modified")

def show_headers(prefix, response_headers):
    values = {name: response_headers.get(name) for name in interesting if response_headers.get(name) is not None}
    print(prefix, values)

def fetch_css(label, url):
    print(label + "_URL", url)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as response:
            body = response.read()
            print(label + "_RESPONSE", response.status, response.headers.get("Content-Type"), len(body))
            show_headers(label + "_HEADERS", response.headers)
    except urllib.error.HTTPError as exc:
        body = exc.read()
        print(label + "_RESPONSE", exc.code, exc.headers.get("Content-Type"), len(body))
        show_headers(label + "_HEADERS", exc.headers)

with urllib.request.urlopen(urllib.request.Request(base, headers=headers), timeout=15) as response:
    html = response.read().decode("utf-8", errors="replace")
    links = re.findall(r'<link[^>]+href=["\']([^"\']+)["\'][^>]*>', html, re.IGNORECASE)
    stylesheets = [urllib.parse.urljoin(base, href) for href in links if ".css" in href]
    print("ROOT", response.status, stylesheets)
    show_headers("ROOT_HEADERS", response.headers)

if not stylesheets:
    raise RuntimeError("No CSS links found in production HTML")

for url in stylesheets:
    fetch_css("CSS_CACHED", url)
    separator = "&" if "?" in url else "?"
    fetch_css("CSS_BYPASS", f"{url}{separator}probe={time.time_ns()}")

raise RuntimeError("diagnostic probe complete")
