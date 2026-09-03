#!/usr/bin/env python3
"""
egress_report.py — can THIS network reach the register's sources at all?

A diagnostic, not a gate. It answers one question before any scheduled runtime
is adopted: does the host's egress get served by gov.au, or challenged?

Netlify's build servers are reliably 403'd by Cloudflare on bpc.vic.gov.au —
a different TLS/JA3 fingerprint from an ordinary client — which is why the
build command is the offline gate (docs/LESSONS-LEARNED.md §1). 46 of the 60
sources are on that one host, so a host that cannot pass it cannot run the
weekly verification, whatever else it offers.

This reuses verify_register.fetch_ex and the SAME one-session-per-host
discipline as the real gate. It does not reimplement fetching. Session reuse is
load-bearing: it took the observed pass rate from ~25% to ~100%, because the
cf_clearance cookie granted on the first pass persists for sibling pages.

Retries default LOWER than the gate's (12), so a totally blocked host reports in
minutes instead of hours. That makes this safe to run first, then run the real
gate (verify_register.py --live) for the actual verdict.

Exit codes: 0 always, unless --strict, which exits 1 if any host returned no
successful fetch at all.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
import time
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import requests  # noqa: E402
import verify_register as vr  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="Per-host egress probe for the register's sources")
    ap.add_argument("--register", default="register.json")
    ap.add_argument("--per-host", type=int, default=0,
                    help="probe at most N urls per host (0 = all 60)")
    ap.add_argument("--retries", type=int, default=3,
                    help="override verify_register.RETRIES (gate uses 12)")
    ap.add_argument("--backoff", type=float, default=2.0)
    ap.add_argument("--timeout", type=int, default=20)
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if any host had zero successful fetches")
    args = ap.parse_args(argv)

    # fetch_ex reads these as module globals at call time.
    vr.RETRIES = args.retries
    vr.RETRY_BACKOFF = args.backoff
    vr.TIMEOUT = args.timeout

    with open(args.register, "r", encoding="utf-8") as fh:
        reg = json.load(fh)
    entries = reg["entries"]

    by_host = collections.OrderedDict()
    for e in entries:
        host = urlparse(e["source_url"]).hostname or ""
        by_host.setdefault(host, []).append(e)

    print(f"probing {len(entries)} sources across {len(by_host)} hosts "
          f"(retries={args.retries}, timeout={args.timeout}s)\n", flush=True)

    tally = collections.OrderedDict()
    started = time.time()
    for host, host_entries in by_host.items():
        sample = host_entries[:args.per_host] if args.per_host else host_entries
        session = requests.Session()   # one session per host — see docstring
        counts = collections.Counter()
        first_error = ""
        for e in sample:
            kind, status, _text, final = vr.fetch_ex(e["source_url"], session=session)
            counts[kind] += 1
            if kind != "ok" and not first_error:
                first_error = f"{e['id']}: {kind} {status}"
            print(f"  {host:32s} {e['id']:24s} {kind:14s} {status}", flush=True)
        tally[host] = (len(sample), counts, first_error)

    elapsed = time.time() - started
    print(f"\n{'HOST':34s} {'N':>3s} {'OK':>4s} {'CF':>4s} {'HTTP':>5s} {'NET':>4s}   FIRST ERROR")
    print("-" * 100)
    blocked = []
    for host, (n, counts, first_error) in tally.items():
        ok = counts["ok"]
        print(f"{host:34s} {n:3d} {ok:4d} {counts['cloudflare']:4d} "
              f"{counts['http_error']:5d} {counts['network_error']:4d}   {first_error}")
        if ok == 0:
            blocked.append(host)

    total = sum(n for n, _c, _e in tally.values())
    total_ok = sum(c["ok"] for _n, c, _e in tally.values())
    print("-" * 100)
    print(f"{'TOTAL':34s} {total:3d} {total_ok:4d}")
    print(f"\nelapsed {elapsed:.1f}s")

    if blocked:
        print("\nBLOCKED HOSTS (zero successful fetches): " + ", ".join(blocked))
        print("This egress cannot run the weekly verification. Do not adopt this "
              "runtime without solving it.")
    else:
        print("\nEvery host returned at least one successful fetch from this egress.")

    return 1 if (blocked and args.strict) else 0


if __name__ == "__main__":
    raise SystemExit(main())
