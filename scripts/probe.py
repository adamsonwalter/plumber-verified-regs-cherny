#!/usr/bin/env python3
"""
Probe helper: fetch a source URL, report status, headers, and extract
visible text (stripped of script/style). Used to reason over real page
content when building the register — never trust training-data memory.

Usage:
  python3 scripts/probe.py <url> [needle]
  python3 scripts/probe.py --batch urls.txt

`needle` (optional) is a substring to search for case-insensitively; prints
the surrounding context if found.
"""
import sys
import re
import json
import urllib.parse

import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-AU,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    "Upgrade-Insecure-Requests": "1",
}

TIMEOUT = 30


def strip_html(html: str) -> str:
    # Drop script/style blocks
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html)
    # Drop tags
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    # Decode common entities
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&rsquo;", "\u2019")
        .replace("&lsquo;", "\u2018")
        .replace("&ldquo;", "\u201c")
        .replace("&rdquo;", "\u201d")
        .replace("&mdash;", "\u2014")
        .replace("&ndash;", "\u2013")
    )
    text = re.sub(r"&[a-zA-Z#0-9]+;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fetch(url: str):
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
    except requests.exceptions.RequestException as e:
        return {"url": url, "ok": False, "error": f"{type(e).__name__}: {e}"}

    final = r.url
    text = ""
    if "html" in r.headers.get("Content-Type", "").lower() or "xml" in r.headers.get(
        "Content-Type", ""
    ).lower():
        try:
            text = strip_html(r.text)
        except Exception as e:
            text = f"[strip error: {e}]"
    return {
        "url": url,
        "final_url": final,
        "ok": 200 <= r.status_code < 300,
        "status": r.status_code,
        "content_type": r.headers.get("Content-Type", ""),
        "content_length": len(r.content),
        "text": text,
    }


def find_needle(text: str, needle: str):
    if not needle:
        return None
    idx = text.lower().find(needle.lower())
    if idx < 0:
        return None
    start = max(0, idx - 120)
    end = min(len(text), idx + len(needle) + 200)
    return text[start:end]


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)
    if args[0] == "--batch":
        with open(args[1]) as f:
            urls = [ln.strip() for ln in f if ln.strip() and not ln.startswith("#")]
        out = []
        for u in urls:
            r = fetch(u)
            out.append(
                {
                    "url": u,
                    "final_url": r.get("final_url"),
                    "ok": r.get("ok"),
                    "status": r.get("status"),
                    "error": r.get("error"),
                    "content_type": r.get("content_type"),
                    "content_length": r.get("content_length"),
                }
            )
        print(json.dumps(out, indent=2))
        return
    url = args[0]
    needle = args[2] if len(args) > 2 else None
    if len(args) >= 3 or (len(args) == 2):
        needle = args[1]
    r = fetch(url)
    print(f"URL:     {url}")
    print(f"final:   {r.get('final_url')}")
    print(f"ok:      {r.get('ok')}")
    print(f"status:  {r.get('status')}")
    print(f"ctype:   {r.get('content_type')}")
    print(f"length:  {r.get('content_length')}")
    if r.get("error"):
        print(f"ERROR:   {r['error']}")
    text = r.get("text", "")
    if needle:
        ctx = find_needle(text, needle)
        if ctx:
            print(f"\nNEEDLE FOUND ({needle!r}):")
            print(f"  ...{ctx}...")
        else:
            print(f"\nNEEDLE NOT FOUND: {needle!r}")
            print(f"  first 600 chars: {text[:600]}")
    else:
        print(f"\nFIRST 1500 chars of visible text:\n{text[:1500]}")


if __name__ == "__main__":
    main()
