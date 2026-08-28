# Test & Verification Log — what was done, what remains

A record of the extraction and validation work performed on this register, and
the steps still outstanding before / after deploy. Written so a reviewer (human
or AI) can see exactly what was checked and what wasn't.

This complements the README's "Proven behaviour" section, which is a summary;
this file is the detail.

---

## 1. Extraction tests (building the register)

The register's original 29 entries were not typed from memory (it now holds 60;
see `SPEC.md` for the current shape). Every claim's `value`,
`key_substring`, and `verified.quote` was produced by a live HTTP fetch of the
cited source, with the relevant needle searched for in the extracted visible
text. The scratch extraction scripts that produced these quotes were removed
after the register was built (their outputs are now baked into
`register.json`); the reusable helper is `scripts/probe.py`.

### What was checked, run by run

| Run | Target | Method | Outcome |
|---|---|---|---|
| Batch reachability | all 12 seed URLs from the brief | `probe.py --batch` | 9×200, 2×403 (bot UA), 1×DNS-fail (the valley-gutter PDF) |
| UA tuning | the 2×403 pages | retry with full Chrome headers + `Sec-Fetch-*` | both → 200 |
| Brotli bug | BPC stormwater page | requested `Accept-Encoding: br` | got garbled bytes — `requests` doesn't auto-decompress brotli without the `brotli` package. **Fix:** dropped `br`, keep `gzip, deflate` only |
| Needle extraction — seeds (10 pages) | each seed's expected value | `extract.py` (needle + ±120 char context) | all 10 needles found verbatim |
| Extension round 1 (10 pages) | backflow, hot water, gasfitting, drainage, sanitary, roofing/water/mech classes, falls-general | `extract2.py` with retry | all 10 verified, verbatim quotes captured |
| Extension round 2 (8 candidates) | DBI, registration, COES, the other 3500 parts, trenching, DBCA95 act page | `round4.py` | 5 verified; 3×404 (COES, trenching, DBCA95) — dropped, no fabricated substitutes |

### Sources that needed correction (not fabrication)

Three of the 13 seeded sources did not support the claim as written. Each was
fixed by pointing at the real authoritative page, never by inventing a URL:

1. **RS-VALLEYGUTTER / RS-EAVESOVERFLOW** — the brief pointed at
   `bpc.vic.gov.au/__data/assets/pdf_file/0026/9908/View-slides-Part-3.pdf`,
   which DNS-fails (redirects to `archive.bpc.vic.gov.au`, host does not
   resolve). Repointed both at the live BPC **HTML** stormwater page, which
   contains the same material verbatim ("the limit has increased from 20 m² to
   40 m²"; "Appendix F has become normative … up to 400 m²").
2. **POWERLINE-APPROACH** — the brief's ESV "powerline safety" page is a
   landing page with **no** `AS 2550.1` reference and no distance figure. The
   real authoritative page is ESV's **"No Go Zones – working around energy
   assets"**, which quotes the 3.0 m / 6.4 m thresholds literally. The claim
   now asserts what that page actually says.

### Register shape at initial build

Recorded as built; the register has since grown to 60 entries (57 VIC, 3
Federal) — see `SPEC.md` for the current shape and `LESSONS-LEARNED.md` §3 for
what may be added.

- 29 entries (26 VIC, 3 Federal).
- 16 sources on `bpc.vic.gov.au`, 5 on `worksafe.vic.gov.au`, 3 on
  `consumer.vic.gov.au`, and 1 each on `legislation.vic.gov.au`,
  `planning.vic.gov.au`, `energysafe.vic.gov.au`, `ncc.abcb.gov.au`,
  `abcb.gov.au`.
- Every entry `status: verified`, each with a non-empty `verified.quote`
  pulled from the fetched page text.

---

## 2. Validation tests (the gate)

### Publish gate — `scripts/verify_register.py`

| Test | Command | Expected | Observed |
|---|---|---|---|
| Structure + domain (offline) | `--offline` | exit 0 | ✅ exit 0 |
| Clean register, live | `--live` | exit 0, all needles present | ✅ exit 0, 29/29 at build; 60/60 at 2026-08-28 |
| Corrupted register, live (GASFITTING → `Part 99`) | `--live --register <corrupt>` | exit 1, blocked | ✅ exit 1 |
| Corrupted register, live (WATER-STD → `Clause ZZZ-CORRUPT-9999`) | `--live --register <corrupt>` | exit 1, blocked | ✅ exit 1 |
| Corrupted `also_requires` (BACKFLOW, bogus second substring) | `--live --register <corrupt>` | exit 1, names the missing string | ✅ exit 1, `missing=['H9Z9-…']` |
| Malformed `also_requires` (string, not list) | `--offline --register <corrupt>` | exit 1, structure gate | ✅ exit 1 |
| Corrupted register, live (BOXGUTTER → `H9Z9-corrupt`) | `--live --register <corrupt>` | exit 1, blocked | ✅ exit 1 |
| Netlify build command (exact) | `python3 scripts/verify_register.py --live \|\| exit 1` | exit 0 | ✅ exit 0 |

### Scheduled agent — `functions/verify_register_scheduled.py`

| Test | Method | Outcome |
|---|---|---|
| Three-verdict decision table | node harness against 3 real URLs | ✅ verified / unverified(flip) / unreachable each fired correctly |
| End-to-end local run (Python) | run handler against a temp copy of register.json | ✅ wrote versioned sidecar; canonical register untouched |
| Cloudflare resilience regression | node `fetch` vs Python `requests` on BPC | node blocked 100%; Python with **per-host `Session` reuse** → ~100% pass. Agent switched to Python + shared session |

---

## 3. Remaining test & verification steps

These were **not** done and should be before considering the deployment fully
hardened:

- [x] **Visual/GUI test of `public/index.html` in a real browser.** Done at
      375×812 against a local server (`.claude/launch.json`, `static-public`).
      All three card variants exercised via a fixture reproducing the scheduled
      agent's exact output. It found four real defects, since fixed:
      the app never read `status`, so a degraded entry kept its "Verified"
      badge (`4f479d5`); `computeChanges()` threw on an absent cache and blanked
      the home screen (`56cc0a1`); the offline pill had never worked because no
      element carried `id="offline"` (`56cc0a1`); and classic mode collapsed to
      188 px on a 375 px phone (`a7d21ff`).
- [ ] **A real Netlify deploy** and confirmation that (a) the static site
      publishes, (b) the build's live gate runs and passes, and (c) the
      scheduled function actually fires on its cron (check Netlify Functions
      logs for the `run_id`). Scheduled functions only auto-fire on
      **published** deploys, not previews.
- [ ] **The 30-second scheduled-function limit under load.** Weekly runs on
      the published site typically finish well under 30 s with session reuse,
      but a very cold/unlucky run (many Cloudflare retries) could approach it.
      If it ever trips, rename the function file to
      `verify_register_scheduled-background.py` to run it as a background
      function (up to 15 min) — the `handler(event, context)` signature is
      identical. Verify this before relying on it.
- [ ] **Git-publish round-trip.** The `_git_publish` path (commits the proposed
      register back via the GitHub Contents API when `GIT_PUBLISH_TOKEN` +
      `GIT_REPO` are set) is implemented but was **not** exercised against a
      live repo (no token was available). Set the env vars and confirm one
      scheduled run commits `register.json` and the site redeploys.
- [ ] **Periodic reconfirmation cadence.** The register is correct as of the
      `verified.on` dates. The schedule re-verifies weekly; confirm the first
      few weekly runs stay green and that any genuine regulatory change (e.g.
      a new AS/NZS 3500 amendment) correctly flips the entry to `unverified`.
- [x] **Contrast / mobile pass** — measured, not eyeballed. Tab-bar icons were
      ~2.6:1 (below the 3:1 WCAG floor for UI controls) and the search field sat
      at 1.12:1 against the page, effectively invisible; now 6.85:1 / 7.9:1 and a
      9.8:1 edge (`d41af18`). Trust-warning bands measure 4.56–7.85:1.
- [ ] **Full accessibility pass** — contrast is done; screen-reader labels,
      focus order, and keyboard navigation remain untested.

- [x] **`scripts/build_register.py` neutralised.** Regeneration was rejected as
      incoherent, not merely stale: `register.json` carries agent-written
      verification state that no script can rebuild, its `_extract*.json` inputs
      were never tracked and are gone, and it knew nothing of the `ui` blocks or
      the 30 `PTR-*` pointers. It now refuses to overwrite an existing register
      (exit 2) and explains the missing inputs rather than raising (exit 3);
      README, `LESSONS-LEARNED.md` §8 and `REPEATABLE-VALIDATION.md` no longer
      present it as a rebuild path. Verified the register is byte-identical after
      a plain run, a `--force-regenerate` run, and a run in an empty directory.
- [ ] **Design an evidence model for values from paywalled standards.** The
      gate can only confirm a `key_substring` against fetched page text. A value
      attested by a human against a licensed copy of AS/NZS 3500 has no branch,
      and the publish gate would hard-fail it. Design that *before* collecting
      values, not after. The `entryTrust()` tiers (`ok` / `stale` / `unknown`)
      in `public/index.html` are the natural carrier for an attested tier; the
      open question is what the gate checks in place of a live fetch. Note that
      purchasing a standard does not grant redistribution rights (separate
      Standards Australia program), and that figures are not copyrightable while
      clause prose is.
- [x] **Claim/substring mismatch audited.** Six entries asserted more than their
      `key_substring` verified. Fixed via `also_requires` (12 additional
      substrings, all confirmed live); two claims trimmed where the page did not
      support them. Enforcement proven: a bogus extra substring blocks the gate
      (exit 1) naming the missing string, and a malformed `also_requires` fails
      the structure gate.
- [x] **Jurisdiction surfaced as a filter.** The results screen now has a
      "Level" bar (Victoria 57 / Federal 3) beside "Type". Verified: 57 + 3 = 60;
      both chips on returns 60, confirming OR within the axis rather than
      intersection; toggling off restores the full list; `documentation` AND
      `Federal` returns 1, matching a direct query of the data; the search screen
      and other three-argument `filterEntries` callers are unaffected. Active
      chip contrast 4.57:1.
- [x] **Sidebar counts were hardcoded.** The desktop sidebar read
      "Verified · 29 regulations" and "Browse all 29 regs" — stale literals from
      when the register held 29. Now derived from the data, and they report
      "N of M verified" if any entry is degraded rather than overstating.
- [ ] **Offline settings display.** `paintSettings()` fills Register version and
      Entries only when `REG` is set, so both show "—" when running from cache,
      though `cache.v` holds the version.

The publish gate and the three-verdict agent logic are proven; the remaining
gaps are deploy-time, plus the two content/tooling items above.
