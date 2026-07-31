# Lessons learned — read this before you start

Hard-won findings from building and validating this register. Each one cost a
real debugging cycle. If you're extending the register, re-verifying it, or
cloning this pattern to another state/trade, these will save you the same time.

---

## 1. The single biggest time-sink: gov.au sites are behind Cloudflare

`bpc.vic.gov.au` (and to a lesser degree `planning.vic.gov.au`) sit behind
Cloudflare and serve a "Just a moment…" JS challenge to clients that don't look
like a real browser. This is the dominant failure mode for the whole pipeline.

**What does NOT work:**
- A plain `User-Agent` like `python-requests/2.x` → **403**.
- Node's global `fetch` (undici) with full browser headers → still **blocked
  ~100%** on `bpc.vic.gov.au`. Cloudflare fingerprints the TLS/JA3 stack, not
  just the headers, and undici's fingerprint is distinct.
- A single request per URL. Even with the right headers, the per-request pass
  rate is only **~25–60%** — you'll randomly mark genuinely-verifiable sources
  as unreachable.

**What DOES work (the combination that took pass rate to ~100%):**
1. Full Chrome headers, including `Sec-Fetch-Dest/Mode/Site/User` and
   `Upgrade-Insecure-Requests: 1`.
2. `Accept-Encoding: gzip, deflate` — **never `br`** unless you also install
   the `brotli` package (see §2).
3. **Reuse one `requests.Session` per host across all entries on that host.**
   The session persists the `cf_clearance` cookie granted on the first
   successful pass, so subsequent retries (and sibling pages on the same host)
   sail through. This is the single highest-leverage fix. It's already
   implemented in `verify_register.run_live_checks` (sessions dict keyed by
   host) and mirrored in the scheduled agent — keep it.
4. Retry with backoff (6–12 attempts, ~3 s + jitter) as a belt-and-braces
   safety net for the rare host that still challenges.

**Implication for stack choice:** write the fetching/verification logic in
**Python (`requests`)**, not Node. Node's fetch gets Cloudflare-blocked where
Python's requests (with a session) passes. The scheduled Netlify function is
Python for exactly this reason — don't "modernise" it to Node without
re-running §4 of `REPEATABLE-VALIDATION.md` and watching BPC entries go red.

---

## 2. `requests` and brotli — a silent garbling bug

If you send `Accept-Encoding: gzip, deflate, br` and the server responds with
brotli, `requests` returns the **raw compressed bytes** unless the optional
`brotli` package is installed. You get a 200 with garbled text, every needle
"not found", and a confusing failure. Symptom: `first 600 chars` in `probe.py`
looks like binary garbage.

**Fix:** request only `gzip, deflate` (both auto-decompressed by `requests`).
Don't ask for brotli unless you've `pip install`ed it. `probe.py` and
`verify_register.py` already do this.

---

## 3. Briefs lie about URLs — verify, never trust, never fabricate

Three of the 13 seeded source URLs in the brief were wrong in materially
different ways:

| Brief said | Reality | Fix |
|---|---|---|
| Valley-gutter/eaves facts are on a `__data/assets/pdf_file/…/View-slides-Part-3.pdf` | That URL 301-redirects to `archive.bpc.vic.gov.au`, which **does not resolve in DNS**. Dead. | The same facts are verbatim on the BPC **HTML** stormwater page. Repoint there. |
| Powerline approach distances are on ESV's `/powerline-safety` page, per `AS 2550.1` | That page is a **landing/hub page** — no standard reference, no distance figure. The `AS 2550.1` claim isn't quotable from any ESV page I could reach. | Repoint at ESV's **"No Go Zones – working around energy assets"** page and assert the 3.0 m / 6.4 m thresholds that ARE literally there. |
| Various "this establishes X" | The cited page mentions X in passing but doesn't *establish* the asserted figure | Assert only what the page actually quotes verbatim. |

**The rule that follows from this (and from the brief itself):** every value
must be a verbatim or directly-quotable fact from the page you actually opened.
If the authoritative page for a claim doesn't exist or can't be opened, mark
the entry `source_not_found` and **exclude it from the verified count** — do
not point it at a plausible-looking guess. A registry of regulations is
worthless the moment one URL is fabricated.

Corollary: **search-engine summaries are not authoritative.** One summary
asserted the DBI threshold was "$22,000 (from 1 July 2024)"; the actual
Consumer Affairs Victoria page said **$16,000** as of the fetch. The page text
won. Always.

---

## 4. `key_substring` is the linchpin of the whole system — design it carefully

The gate and the agent both reduce "does the claim still hold?" to: **is
`entry.key_substring` literally present (case-insensitive) in the fetched
visible text?** Everything hinges on that substring being:

- **Specific enough to actually validate the claim.** `"3500.3"` is too weak
  (appears in navigation); `"3500.3:2025"` pins the edition.
- **Stable across minor page edits.** Don't key on surrounding punctuation or
  HTML structure — extract visible text first, then search.
- **Genuinely the load-bearing fact.** For a dollar threshold, the figure with
  its formatting (`$750`, `$16,000`); for an edition, the full string
  (`AS/NZS 3500.3:2025`); for a clause, the clause number as printed
  (`H2D6(3)`).

If you're tempted to make the substring very short so it "always passes" —
that defeats the gate. If you make it too long/fragile, you'll get false
`unverified` flips on cosmetic page changes. Aim for the smallest substring
that uniquely identifies the asserted value.

---

## 5. The agent must never mutate the canonical register mid-run

Early on, the agent's `loadRegister()` walked up from `__dirname`/`..` and
found the repo's canonical `register.json`, then **overwrote it** during a
test, flipping 17 entries to `unreachable` (a bad Cloudflare run). Because this
isn't a git repo, that would have been unrecoverable without
`build_register.py`.

**Rules now enforced:**
- The agent writes a **versioned sidecar** (`register.proposed.<runid>.json`),
  never the canonical file in-place.
- Publishing back to the repo happens only via an explicit, token-gated git
  commit (the `_git_publish` path), which itself goes through Netlify's normal
  build + live gate.
- `build_register.py` is deterministic — keep it as the recovery primitive.
- In ESM, `__dirname` is undefined — use `fileURLToPath(import.meta.url)` (the
  Python function doesn't have this issue, but it bit the original Node
  prototype).

---

## 6. Netlify scheduling constraints that shape the design

- Scheduled functions are declared in `netlify.toml`:
  `[functions."verify_register_scheduled"] schedule = "0 7 * * 1"`. This is the
  **platform scheduler** — explicitly not `setInterval`/`setTimeout`, which the
  brief forbids.
- Scheduled functions have a **30-second** execution limit. Re-verifying ~30
  Cloudflare-protected sources can approach that on a cold run. Background
  functions (filename suffix `-background`) get 15 min. The handler signature
  is identical, so if you hit the wall, rename the file — don't refactor.
- Scheduled functions **only auto-fire on published deploys**, not previews.
  During development you invoke the function manually (Netlify UI or a local
  run via `python3 functions/verify_register_scheduled.py`).
- The handler must be **idempotent** and keyed on the platform invocation id
  (`context.aws_request_id`), never the request body. The body for a scheduled
  invocation is just `{next_run: <iso8601>}`.

---

## 7. How the verbatim quotes were obtained (so you can reproduce or extend)

The quotes in `register.json` came from a now-removed set of extraction
scripts that fetched each source, stripped HTML, and recorded ±120 chars of
context around each needle. The reusable residue is `scripts/probe.py`:

```bash
python3 scripts/probe.py <url> "<needle>"
```

To add a new entry: find the authoritative page, `probe.py` it with the
candidate needle, copy the returned context verbatim into the entry's
`verified.quote`, set `key_substring` to the load-bearing substring, then run
§1 + §2 of `REPEATABLE-VALIDATION.md` to confirm the gate passes. **Never type
a quote from memory** — the brief forbids it and the gate will eventually
catch you (the needle won't match on a real fetch).

---

## 8. Small things that wasted disproportionate time

- **Duplicate `[build]` table in TOML** is illegal (silent override / parse
  error). Merge all build settings under one `[build]`.
- **`f-string` with nested quotes** (`f"{e['id']}"` inside a `'…'` string) is
  a `SyntaxError` on Python ≤3.11. Use double-outside-single-inside or
  `.format()`.
- **`import mod from` vs `import * as mod`** in ESM: default import gives only
  the default export; named exports (`fetchSource`) need a namespace import.
  Irrelevant now that the function is Python, but it bit the Node prototype.
- **The BPC "class" pages quote the work-class part numbers directly** (e.g.
  "Under Part 4 of the Plumbing Regulations 2018 …"). The brief claimed
  "Division 7" for roofing — the page says **Part 4**. Record what the page
  says, not what the brief says.

---

## 9. Atomic writes + advisory locks + 409 retry — why and where

Three write sites in this repo used to be vulnerable to corruption or race
conditions. All three are now hardened in `scripts/fsutil.py`.

### The three hazards (before the fix)

| Site | What was wrong |
|---|---|
| **Agent sidecar write** (`functions/verify_register_scheduled.py:237`) | `open(sidecar, "w")` truncates then writes. A crash mid-write leaves a partial JSON file. |
| **`build_register.py`** (two writes) | Same — both `register.json` and `public/register.json` were written non-atomically. |
| **`_git_publish`** (GitHub Contents API) | Fetches the file's `sha`, then PUTs with it. If another commit landed in between, GitHub returns **409 Conflict** and the run crashed. |

### The three fixes

1. **`fsutil.atomic_write_json(path, obj)`** — writes to a same-directory temp
   file, `fsync`s, then `os.replace`s. `os.replace` is atomic on POSIX, so a
   reader never sees a half-written file. A crash leaves the old file intact.
   Wired into the sidecar write and both `build_register.py` writes.

2. **`fsutil.file_lock(target, timeout=30)`** — advisory exclusive lock via
   `fcntl.flock` with jittered backoff. Wraps the agent's publish step (the
   read-modify-write of the canonical register + git commit) so two overlapping
   invocations serialise instead of clobbering. If the lock can't be acquired,
   raises `LockTimeout` — the caller logs and skips (another run is mid-publish).

3. **409 retry loop in `_git_publish`** — on HTTP 409 (sha stale), re-fetches
   the current `sha` and retries (up to 3 attempts with linear backoff).
   Transient collision → self-heals; persistent conflict → clear error.

### Important: the lock is NOT about URL fetching

The agent's fetch phase (opening 29 sources, checking substrings) is pure
read-only — it never touches the register file. The lock only guards the
**publish** step. The URL fetching resilience (Cloudflare rejections, timeouts)
comes from a separate mechanism: per-host `requests.Session` for cookie
persistence (§1 above), and retry-with-backoff in `verify_register.fetch`. The
lock and the fetch retries are complementary but independent.

### Rule for the next coder

Any new write to `register.json` or a sidecar **MUST** use
`fsutil.atomic_write_json`. Any new read-modify-write cycle on the canonical
register **MUST** be wrapped in `fsutil.file_lock`. Don't go back to
`open(path, "w")`.

---

## TL;DR for the next AI coder

1. Write fetch/verify logic in **Python with `requests`**, one **`Session`
   per host**, browser headers, `gzip, deflate` only, retry with backoff.
2. **Verify every source URL yourself** before trusting it; briefs and search
   summaries are frequently wrong. Repoint dead/misattributed sources at the
   real authoritative page; never fabricate.
3. Make `key_substring` specific and load-bearing — the whole gate is one
   substring membership test.
4. Never mutate the canonical `register.json` mid-run — write a sidecar,
   publish via token-gated commit.
5. Any write to `register.json` MUST use `fsutil.atomic_write_json`; any
   read-modify-write MUST wrap in `fsutil.file_lock` (§9).
6. Run the three commands in `REPEATABLE-VALIDATION.md` §1–§3 before
   declaring anything done: offline gate, live gate (exit 0), corruption gate
   (exit 1).
