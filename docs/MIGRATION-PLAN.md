# Migration plan — Netlify → Bolt.new, with verification on GitHub Actions

Status: **agreed sequence, not yet started.** Written 2026-09-03 after a full
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
| GitHub Actions | **CONFIRMED absent** before this branch — no `.github/` directory existed |
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

### 2.0 — Test GitHub Actions egress FIRST (before any other work)

**Highest-information move available, and it gates everything after it.**

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

If `bpc.vic.gov.au` is challenged, stop and re-plan §2.2 before writing anything
else. Options in that case, in order of preference: a self-hosted runner on a
network gov.au serves; a scheduled job on a host whose egress does pass; or the
existing local pre-commit gate kept as the only live gate, with the app told to
say so honestly. **Do not proceed to §2.2 on an assumption here.**

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

### 2.2 — Move weekly verification to GitHub Actions

Preserve the working Python verifier. Do not port it.

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
3. **Where the verifier runs** if GitHub Actions egress fails (§2.0).

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
