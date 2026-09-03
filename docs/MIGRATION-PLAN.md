# Migration plan — Netlify → Bolt.new, with verification on GitHub Actions

Status: **agreed sequence; §2.0 executed and failed — see §2.0a.** Written 2026-09-03 after a full
verification pass against the live site, the repo, and the Netlify deploy API.

Read order for anyone picking this up: [`SPEC.md`](SPEC.md) (what the system
must prove) → [`LESSONS-LEARNED.md`](LESSONS-LEARNED.md) (what already went
wrong) → [`BOLT-MIGRATION-BRIEF.md`](BOLT-MIGRATION-BRIEF.md) (the migration
itself) → this file (the order to do it in, and why).

This plan **supersedes** [`AI-CODER-ANSWERS.md`](AI-CODER-ANSWERS.md) §F item 4
("whether to repair Netlify at all"). That question is closed — see §1.

Every claim below is labelled **CONFIRMED** (evidence gathered 2026-09-03,
command reproducible) or **OPEN** (untested, and named as such).

---

## 0. Verification record — 2026-09-03

| Check | Result |
|---|---|
| Site serving | **CONFIRMED live.** `GET /` → 200, `GET /register.json` → 200 |
| Register integrity | **CONFIRMED.** Root `register.json`, `public/register.json` and the served file are byte-identical (`sha256 2309f290…`). 60 entries, all `status: verified` |
| Deployed commit | **CONFIRMED** = repo HEAD `2c94c34` |
| Verifier works | **CONFIRMED.** `verify_register.py --live` → **exit 0, 60/60 confirmed**, including all 15 `also_requires` substrings across 7 entries and the one `.docx` source |
| `last_run` | **CONFIRMED absent** from the served register. No scheduled run has ever published |
| Scheduled function | **CONFIRMED never deployed** — see §1 |
| Freshness fail-closed | **CONFIRMED absent.** No "overdue" or "Never checked" state exists in the app |
| Monitoring | **CONFIRMED absent.** Nothing alerts on a failed or missed run |
| GitHub Actions | Added on this branch. Egress test run 2026-09-03: **FAILED** — see §2.0a |
| Bolt | **CONFIRMED not initiated.** No `BOLT.md`, no Bolt artefacts |
| Repo visibility | **CONFIRMED public.** `raw.githubusercontent.com/.../register.json` → 200. Bears on §3.1 |

### What a user sees right now

Entry ages against 2026-09-03:

| `verified.on` | Entries | Age |
|---|---|---|
| 2026-07-31 | 29 | 34 days |
| 2026-08-27 | 30 | 7 days |
| 2026-08-28 | 1 | 6 days |

The app displays **"Live data"** and **"Up to date"** beside **"Last checked —"**.
Twenty-nine entries carry a "Verified on 2026-07-31" line with nothing behind it.

That is the precise failure this product exists to prevent, in production today.
It is why §2.1 is first and not negotiable.

---

## 1. The decisive finding — the scheduled function was never deployed

`AI-CODER-ANSWERS.md` §B named this as the thing to check first, because it
would moot the rest, and marked it unverifiable without dashboard access.
It is now **CONFIRMED** from the Netlify deploy record for the current
production deploy (`6a97a3c1a8819100086856be`, commit `2c94c34`):

```
"available_functions":  []
"function_schedules":   []
"required_functions":   []
summary: "No functions deployed — This deploy did not include any functions."
```

Python is not a Netlify Functions runtime. `functions/verify_register_scheduled.py`
(386 lines) has never existed on the platform.

**The three blockers documented in `AI-CODER-ANSWERS.md` §B are all real and all
moot.** The 30-second synchronous ceiling, the missing `included_files`, and the
root/`public` register split never got a chance to fire, because nothing ran.

Two consequences, both load-bearing for this plan:

1. **There is no Netlify repair path.** Renaming to `-background.py`, adding
   `included_files`, and unifying the register path would together fix a function
   that still would not deploy. Do none of them.
2. **GitHub Actions is not the preferred option in §2.2 — it is the only one.**
   The verifier needs a scheduled Python runtime with acceptable egress. That
   decision now rests entirely on the egress test in §2.2.

---

## 2. The sequence

Ordered. Each step has a stop condition that is checkable by someone other than
the person who did the work.

### 2.0 — Test GitHub Actions egress FIRST — DONE 2026-09-03, **FAILED**

**Result: GitHub-hosted runners cannot verify `bpc.vic.gov.au`.** Evidence and
consequences in §2.0a below. Read that before anything else in this plan.

46 of the 60 sources are `bpc.vic.gov.au`, behind Cloudflare. Netlify's build
servers are reliably 403'd there (`LESSONS-LEARNED.md` §1) because of their TLS
fingerprint. GitHub-hosted runners are Azure IPs and may be challenged the same
way. **OPEN — untested.**

Run `.github/workflows/egress-test.yml` (added on this branch). It does two
things and publishes nothing:

- `scripts/egress_report.py` — a fast per-host probe. Reuses `vr.fetch_ex` and
  the same one-session-per-host discipline as the gate, with retries turned
  down, so a total block reports in minutes rather than hours.
- `verify_register.py --live` — the real acceptance test, unmodified.

**Stop condition: 60/60 confirmed from a GitHub-hosted runner, exit 0.**

**NOT MET.**

---

### 2.0a — Egress test result — CONFIRMED FAILED

Run [33715477272](https://github.com/adamsonwalter/plumber-verified-regs-cherny/actions/runs/33715477272),
`ubuntu-latest`, 2026-09-03.

**Probe job** (3 retries, one session per host) — **succeeded as a diagnostic**,
and the diagnosis is bad:

```
HOST                                 N   OK   CF  HTTP  NET
www.bpc.vic.gov.au                  46    0   46     0    0   <- all challenged
www.legislation.vic.gov.au           1    1    0     0    0
www.planning.vic.gov.au              1    1    0     0    0
www.worksafe.vic.gov.au              5    5    0     0    0
www.energysafe.vic.gov.au            1    1    0     0    0
www.consumer.vic.gov.au              3    3    0     0    0
ncc.abcb.gov.au                      1    1    0     0    0
www.abcb.gov.au                      1    1    0     0    0
content.legislation.vic.gov.au       1    1    0     0    0
TOTAL                               60   14              elapsed 437s
```

**Gate job** (the real test, 12 retries, unmodified `verify_register.py --live`):

```
offline gate           -> exit 0
live gate  exit=1  elapsed=2255s
every bpc.vic.gov.au entry: kind=cloudflare, needle_present=False
```

So the retry budget is not the problem. Three retries and twelve retries both
return zero successful BPC fetches; the second merely takes 37 minutes to say so.
**46 of the 60 sources are unreachable from a GitHub-hosted runner.**

Same-day local baseline for comparison: `verify_register.py --live` from
Walter's machine, **exit 0, 60/60 confirmed, ~57 s**.

The gate failed closed and refused to publish, which is the system working
correctly. That is the only good news in this section.

#### Correction to LESSONS-LEARNED §1 — the cause is probably not JA3

`LESSONS-LEARNED.md` §1 attributes the Netlify block to a "different TLS/JA3
fingerprint than an ordinary client". **INFERRED, and probably wrong.**

Plain `curl` from the *same local IP that passes* also receives a 403 managed
challenge on `bpc.vic.gov.au`. Local runs clear it by retrying with a reused
session; the GitHub runner never clears it at all, running byte-identical Python
and `requests` with the same `BROWSER_HEADERS`. The client TLS stack is
therefore not the differentiator between the passing and failing cases.

The remaining difference is the network: GitHub-hosted runners are Azure
datacentre IPs. **IP/ASN reputation is the more likely cause.** This is
INFERRED, not confirmed — confirming it means running the same code from a
non-Azure datacentre IP and from a residential IP and comparing.

It matters because it decides which fix works. If it is ASN reputation, no
amount of header or TLS impersonation from a datacentre helps, and most cheap
VPS providers will fail the same way.

#### DataVic (CKAN) assessed as a side door — does NOT substitute

Checked 2026-09-03 after it was raised as an alternative.

**The portal is clean.** `discover.data.vic.gov.au` classifies as *reachable* —
the honest, self-identifying client succeeds with no WAF, no challenge, no UA
sniff. Its CKAN API answers directly:

```
GET /api/3/action/organization_show?id=building-and-plumbing-commission
  -> 6 datasets
```

**But none of the six carry the facts this register verifies.** They are
administrative and statistical publications:

| Dataset | What it is |
|---|---|
| Building Permit Activity Data | permit counts, cost, type, location |
| Building Permit Activity Monthly Summaries | the above, consolidated monthly |
| BPC - Building Practitioner Register | who is registered, 48,397 rows |
| Security of Payment Adjudication Activity Data | payment-dispute adjudications |
| VBA five-year metrics 2011-2016 | historical agency metrics |
| VBA Financial Statement 2014-15 | agency financials |

The 46 blocked entries verify none of that. They assert **regulatory content** —
`3500.3:2025` as the mandated stormwater edition, a valley-gutter catchment
limit of `40 m²`, Appendix F eaves overflow at `400 m²`, the scope of each
plumber class and category, compliance-certificate and registration
requirements. That text lives on BPC's own guidance pages and is not published
as a dataset anywhere.

**No sitemap side door either.** `/sitemap.xml`, `/sitemap_index.xml` and
`/robots.txt` on `www.bpc.vic.gov.au` all return 403 behind the same challenge.
And a sitemap would only yield URLs; the gate needs the page *text*, because the
whole method is asserting a `key_substring` appears verbatim.

**Conclusion: DataVic does not change §2.0a.** The options below stand.

*Separate from this problem — a product opportunity, not a fix.* The Building
Practitioner Register has a live, unchallenged datastore API
(`/api/3/action/datastore_search?resource_id=3599fa1f-…`, 48,397 rows, fields
including accreditation id, status, limitation, commenced, expires). "Is this
builder actually registered?" is a plausible paid feature for the Bolt app, on
an official feed that needs none of the machinery in this section. Worth its own
decision after §2.5, and it must not be confused with weekly verification.

#### Options, ranked

1. **Self-hosted GitHub Actions runner on a network gov.au serves.**
   *Proven today* — Walter's connection does 60/60 in ~57 s. Only `runs-on:`
   changes; the whole Actions design, the cron, the secrets handling and the
   publish step survive unmodified. **Cost: it needs an always-on machine.** For
   a paid weekly promise, "unattended" cannot mean "whenever the laptop is
   open" — budget for a small dedicated box on that connection.
2. **Test a VPS in a different ASN before committing to (1).** Cheap, and
   `scripts/egress_report.py` is the test — it runs anywhere Python does. If the
   cause is datacentre-IP reputation this will fail too, which is itself worth
   knowing in ten minutes.
3. **Approach BPC for an allowlist or a data feed.** Slow, but it is the durable
   answer for a paid product that cites them weekly, and it removes the
   dependency on clearing a bot challenge entirely. Worth starting in parallel
   with (1) rather than instead of it.

#### Cheap win, independent of where the verifier runs

The 46 BPC entries resolve to only **14 distinct URLs** — 36 of them come from
just four pages (the AS/NZS 3500 Parts 1-4 guidance pages, carrying 10, 11, 9
and 6 entries each). `run_live_checks()` fetches per entry, so it issues 46
requests where 14 would do.

De-duplicating by URL within a run cuts BPC requests by 70%, shortens the run
proportionally (the failed GitHub run spent 2255 s largely on redundant
retries), and is gentler on a host that is already challenging us. It does not
defeat a hard block, and it must not change verdict semantics — each entry still
gets its own `key_substring` and `also_requires` assertion against the shared
fetched text. Worth doing wherever the verifier ends up.

**Not recommended: TLS/JA3 impersonation libraries.** If the diagnosis above is
right they do not address the cause; if it is wrong they work until Cloudflare
updates, and a weekly compliance guarantee should not rest on winning that race.

#### What this does NOT change

- §2.1 (stabilise the trust system) is untouched and still first in line for
  actual work. It is more urgent now, not less: the register cannot yet be
  re-verified unattended anywhere, so the app must stop implying it is.
- §2.5 onward (the Bolt commercial layer) is untouched. The verifier's runtime
  was always a separate question — `AI-CODER-ANSWERS.md` §E/Q43 — and the
  smallest path to a paid pilot still does not touch it.

### 2.1 — Stabilise the trust system

Before payments, before Bolt. The app must stop implying freshness it cannot
evidence. All in `public/index.html` unless noted.

- Rename the network-state pill. "Live data" describes the **download**; it is
  read as a claim about the **verification**. "Connected" or equivalent.
- Show the actual register-level verification date prominently, not buried in
  Settings.
- With no completed run, say **"Never automatically checked"** — not `—`.
- **Fail closed at 14 days** (two missed weekly cycles): show *Verification
  overdue* and stop presenting per-entry "Verified on" as current. This is the
  per-entry fail-closed principle in `entryTrust()` applied to the register as a
  whole.
- Make root `register.json` canonical, and have whatever publishes write the
  **served** path too — see the correction in §2.2.

**Stop condition: the UI never implies freshness without a successful recorded
run.** Testable by deleting `last_run` and by back-dating it 15 days.

### 2.2 — Move weekly verification to GitHub Actions — BLOCKED on §2.0a

Preserve the working Python verifier. Do not port it. **Everything below is
correct except the runner**: per §2.0a, `runs-on: ubuntu-latest` cannot reach 46
of the 60 sources. Settle option 1 or 2 in §2.0a first, then the rest of this
step stands as written.

The workflow needs: weekly cron; `workflow_dispatch`; Python 3.12 + `requests`;
per-host session reuse (**not optional** — it took the pass rate from ~25% to
~100%); `.docx` extraction; all `key_substring` and `also_requires` checks;
validation before publication; atomic register update; failure notification;
concurrency protection.

**Correction to the original plan — skip the build-copy step.** "Copy root →
served during builds" assumes a build shape Bolt may not have. Have the Action
write **both paths** (or only the served one) directly. One less host
dependency, and it removes the divergence mechanism instead of papering over it.

Stop conditions, all of them:

- 60/60 sources complete from GitHub Actions;
- `last_run` reaches the **served** application, and Settings → Last checked
  shows it;
- a deliberately wrong `key_substring` blocks publication and names the missing
  string;
- a deliberately wrong `also_requires` entry does the same;
- a failed run leaves the prior verified register active;
- **one actual scheduled invocation is observed** — not a manual dispatch.

### 2.3 — Keep Netlify live during the Bolt build

Do not interrupt the working site. It is the production reference.

Capture acceptance criteria for: mobile layout; filtering; all three trust
states; source links; saved regulations and notes; PWA installation; offline
messaging; desktop and phone appearance.

**Correction — describe offline honestly.** There is **no service worker**
(CONFIRMED). "Offline" means a `localStorage` copy of the register; the
installed icon opened with no network will not boot at all. Write the criterion
as the behaviour that exists, or decide to add a service worker as new work —
do not write "preserve PWA offline" and discover the gap later.

### 2.4 — Decide what customers are buying

Choose before implementing Stripe.

Recommended positioning: **$9/month for the maintained service** — a
continuously checked register, visible freshness evidence, regulation-change
warnings, saved items and notes across devices, and future alerts. The
government source material stays public; customers pay for verification,
organisation and convenience.

**Correction — the register is already public, twice.** The GitHub repo is
public and `raw.githubusercontent.com/.../register.json` returns 200 (CONFIRMED).
Gating the app while the raw file sits on a public repo gates nothing. So this
decision also decides whether the repo goes private — which in turn affects
whether the Action can publish by committing back. See §3.1.

### 2.5 — Build the Bolt commercial layer

Import the existing GitHub project and preserve its visual behaviour initially.
Carry `index.html` over as a static asset first; convert to the host's stack
only if something concretely requires it (`BOLT-MIGRATION-BRIEF.md` §2).

Add: account signup and login; email verification; password reset; Stripe $9
monthly subscription; test and live modes; **server-side** entitlement checks;
billing management and cancellation; account deletion; privacy and terms.

Do not add an operational LLM. Verification stays deterministic.

**Stop condition: expired, cancelled and unauthenticated users cannot access
paid functionality** — proven against the server endpoint, not the client.

### 2.6 — Add only necessary user data

Server-side: account identity; Stripe customer/subscription references;
cross-device saved regulations; notes; active register version and verification
metadata.

Local: theme and layout; temporary filters; last-viewed screen; non-authoritative
preferences. The app currently keeps ten `localStorage` keys — `bookmarks`,
`notes`, `reviewed` and `pinnedJobs` are the candidates for syncing;
`filterHintUses`, `lastSeenVersion`, `lastViewed`, `lastVisit`,
`recentSearches` and `visitStreak` are per-device conveniences and should stay
local.

Row-level policies so users reach only their own records.

### 2.7 — Design register publication into Bolt

```
GitHub Action → verified proposed register → authenticated Bolt server function
              → versioned database record → atomic active-version switch
```

Requirements: failed verification never replaces the active version; previous
versions remain recoverable; publication records source commit and run id;
authenticated users receive only the active version; the UI derives freshness
from `last_run`; no model rewrites verified claims automatically.

Note the gap being closed here: today the agent **never invokes the publish
gate** before committing (`AI-CODER-ANSWERS.md` §A/Q33). Fix that during the
migration rather than porting the flaw.

### 2.8 — Backups and operational controls

Bolt project history is not a database backup.

Before launch: establish database exports or provider-managed backups; **test a
restore** of user records and register versions; treat Stripe as the billing
authority; minimise stored personal information; monitor verification failures,
Stripe webhooks and authentication errors; document manual recovery.

An untested restore is not a backup.

### 2.9 — Run a paid pilot

Recruit 5–10 plumbers rather than launching broadly. Measure: how many enter
payment details; weekly and monthly retention; regulations searched; saved
entries; whether freshness information is understood; support questions;
cancellation reasons.

Ask specifically whether "last checked" and change warnings justify the
subscription. That is the product thesis, and it is the one thing a pilot can
falsify cheaply.

### 2.10 — Cut over only after parity

Mobile and desktop comparisons; PWA installation; password-reset and Stripe
failure scenarios; overdue and unreachable-source states; backup restoration;
JSON export/import for local user data; account for browser storage being tied
to the old domain; keep Netlify available for rollback.

---

## 3. Open decisions — Walter's call

1. **Is the register public or paid?** Determines the entire data path, and now
   also the repo's visibility (§2.4). Everything in §2.5 and §2.7 depends on it.
   **Decide before building payments, not after.**
2. **The overdue threshold.** 14 days recommended — two missed weekly cycles.
   One missed run is a transient; two is a broken pipeline.
3. **Where the verifier runs.** GitHub-hosted runners are ruled out (§2.0a).
   Choose between a self-hosted runner on a passing network, a VPS in another
   ASN if it tests clean, and approaching BPC directly. This is now the
   plan's critical path.

---

## 4. What does not move

- **The verifier.** GitHub Actions can be its permanent scheduled runtime. The
  smallest sequence to a paid pilot does not touch it: move the page, add
  auth and entitlement, keep consuming the register the Action publishes.
- **`register.json` as stateful data.** It carries verification history no
  script can regenerate. There is no rebuild command, by design.
  `build_register.py` refuses to run for this reason.
- **One implementation of the verification logic.** The gate and the agent share
  `verify_register.py`. Two copies drifting apart is the worst available outcome
  for this system.

---

## 5. Dead weight to remove once §2.2 passes

- `functions/verify_register_scheduled.py` — 386 lines targeting a runtime that
  never existed. Its git-publish conflict handling (`_git_publish`, fetch-sha /
  PUT / 409-retry under an advisory lock) is the best-built part and is worth
  reading before writing the Action's publish step.
- The `[functions."verify_register_scheduled"]` schedule block and
  `PYTHON_VERSION` in `netlify.toml`.

Leave both in place until the Action is proven. Removing them first would delete
the reference implementation for the publish step.
