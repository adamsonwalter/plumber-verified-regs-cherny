# Verified Plumbing & Roofing Regulations Register (Victoria)

A single-page web app that gives licensed plumbers and roofers operating in
Victoria, Australia a **live, trustworthy register** of the regulations,
standards and statutory thresholds that govern their work — sourced from
Victorian statutory instruments (Plumbing Regulations 2018, OHS Regulations
2017, Building Act 1993, Domestic Building Contracts Act 1995, Dangerous Goods
Act 1985) and regulator guidance (BPC, WorkSafe Victoria, Energy Safe
Victoria, Consumer Affairs Victoria), plus the Commonwealth instruments that
apply alongside them (National Construction Code, ABCB guidance, Australian
Consumer Law).

Every value shown is a **verbatim or directly-quotable fact from the cited
authoritative government page**, confirmed by an automated agent that opens
each source and reasons over the current text. This register makes **no
compliance determination**.

> **Working in this repo?** [`docs/SPEC.md`](docs/SPEC.md) states what the system
> must prove and what may enter the register. Read
> [`docs/LESSONS-LEARNED.md`](docs/LESSONS-LEARNED.md)
> first — it captures the Cloudflare, fetch, and source-truth pitfalls that
> dominate this project. For what was tested and what remains, see
> [`docs/TEST-AND-VERIFICATION-LOG.md`](docs/TEST-AND-VERIFICATION-LOG.md); to
> re-run every check, follow [`docs/REPEATABLE-VALIDATION.md`](docs/REPEATABLE-VALIDATION.md).

## Three capabilities

| | What | Where |
|---|---|---|
| (a) | **One page** rendering every entry as *verified* (value, source, date last confirmed, agent id, supporting quote), *needs recheck* (what changed), or *source unreachable* (HTTP status/error, last successful check, remedial note) — grouped by jurisdiction (VIC / Federal). | `public/index.html` |
| (b) | **A scheduled agent** on Netlify's own scheduler (not an in-process timer) that re-opens every source URL, extracts the current text, reasons about whether the recorded claim still matches, and updates the register — refreshing `verified` or flipping to `unverified`/`unreachable` with evidence. | `functions/verify_register_scheduled.py` + schedule in `netlify.toml` |
| (c) | **A single JSON register file** as the sole source of truth for both the page and the agent. | `register.json` (mirrored to `public/register.json` for serving) |

## The publish gate

`scripts/verify_register.py` is the hard gate. It implements five checks:

1. **Structure** — fails immediately if any entry lacks `source_url`, `jurisdiction`, `fails_if`, or `key_substring`.
2. **Reachability** — live HTTP GET against every source; on non-2xx/timeout asserts the entry is `unreachable` with a non-empty `remedial_note` and *not* simultaneously `verified`.
3. **Content** — for every 2xx response, asserts the recorded `key_substring` (edition string, dollar figure, clause number, m² threshold, year) is literally present in the page text; on mismatch asserts the entry flips to `unverified`.
4. **Domain** — every source URL must resolve to an official domain (`*.gov.au`, `abcb.gov.au`, `ncc.abcb.gov.au`, …); anything else is rejected outright.
5. **Publish gate** — **exit 1** if any entry is marked `verified` without a matching successful check from the current run.

```bash
# Fast structural / domain / self-consistency check (no network):
python3 scripts/verify_register.py --offline

# Full live gate against the real internet:
python3 scripts/verify_register.py --live
```

### Proven behaviour

- **Clean register, `--live`** → exit **0**, all 29 entries confirmed with their key substrings present in the fetched source text.
- **Corrupted register** (one entry's `key_substring` deliberately falsified), `--live` → exit **1**, gate blocks: *"marked verified but live check did not confirm (needle_present=False)"*.
- **Scheduled agent** local run → all sources re-verified; the three verdicts (verified / unverified-on-mismatch / unreachable-on-error) each proven against the live internet.

## How a value gets into the register

A claim is only ever recorded as `verified` if a scheduled run actually opened
the source URL, fetched the current text, and found the recorded `key_substring`
literally present. No value is typed from training-data memory. If no
authoritative government page exists for a claim, it is marked
`source_not_found` and excluded from the verified count — never pointed at a
plausible-looking guess.

## Register contents

29 entries (26 VIC, 3 Federal), spanning:
- Stormwater drainage standards (AS/NZS 3500.3:2025), valley-gutter 40 m² limit, mandatory eaves-overflow Appendix F (400 m² / 1% AEP), water/sanitary/heated-water parts of AS/NZS 3500.
- The $750 plumbing compliance-certificate threshold; the Plumbing Regulations 2018 work-class definitions (backflow Part 5, gasfitting/drainage/sanitary/roofing/water/mechanical Part 4).
- The BPC regulator (est. 1 July 2025, replacing the VBA); registration/licensing; hot-water 60 °C storage + tempering.
- WorkSafe falls (>2 m, housing + general construction), asbestos removal caps (10 m² / 1 hour per 7 days, Part 4.4 OHS Regs), asbestos notification (Dangerous Goods Act Pt VIA, 1 Jan 2004, 60 days), confined-spaces compliance code.
- Powerline No Go Zone (3.0 m / 6.4 m spotter zone, Energy Safe Victoria).
- Domestic building warranties (10 years, Building Act 1993 / DBCA 1995) and DBI threshold (works over $16,000).
- Federal: NCC 2022 Housing Provisions Pt 7.4 gutters/downpipes, box-gutter H2D6(3) carve-out, Australian Consumer Law guarantees.

## Local development

```bash
# Serve the static page:
cd public && python3 -m http.server 8000   # → http://localhost:8000

# Rebuild the register from the verified-quote extraction (deterministic):
python3 scripts/build_register.py

# Inspect any source URL live:
python3 scripts/probe.py <url> [needle]

# Run the scheduled agent locally (writes a versioned sidecar; never mutates register.json):
python3 functions/verify_register_scheduled.py
```

## Netlify deployment

`netlify.toml` wires:
- `publish = "public"` (the static site).
- `functions = "functions"` (the Python scheduled function).
- `[functions."verify_register_scheduled"] schedule = "0 7 * * 1"` — weekly re-verification on the platform scheduler.
- A build `command` that runs the live publish gate so a bad register fails the deploy.

To let the scheduled agent commit its proposed update back (so the site
auto-republishes), set these environment variables in Netlify:

```
GIT_PUBLISH_TOKEN = <github PAT with contents:write>
GIT_REPO          = <owner>/<repo>
GIT_BRANCH        = main                 # optional, defaults to main
REGISTER_PATH_IN_REPO = register.json    # optional, defaults to register.json
```

Without a token the agent still runs and writes a versioned proposed-register
sidecar for manual review; the publish gate still governs what ships.

## Notes & limitations

- Several gov.au pages (notably `bpc.vic.gov.au`) sit behind Cloudflare and
  intermittently serve a JS challenge to non-browser clients. The verifier and
  the agent use a realistic browser User-Agent, retry with backoff, and —
  crucially — **reuse a `requests.Session` per host** so the Cloudflare
  clearance cookie granted on the first pass persists across retries. This
  takes the per-run pass rate from ~25% to ~100% for those sources. On the
  rare run where a source still can't be cleared, it is honestly marked
  `unreachable` with a remedial note and re-tried next run.
- This is a demonstration built on a curated regulatory baseline; the agent
  verifies real public pages but the app makes no compliance determination.
