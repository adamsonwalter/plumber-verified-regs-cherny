# Answers — production questions from the second AI coder

Answering `AI-CODER-PRODUCTION-QUESTIONS.md`. Every claim below is labelled:

- **CONFIRMED** — evidence gathered just now, command shown or reproducible
- **UNVERIFIABLE HERE** — needs Netlify dashboard/log access, which I do not
  have. I name the exact check that would settle it.

**Your questions found three independent, sufficient blockers.** Any one alone
would prevent the weekly cycle from working. All three are present, so the cycle
has never worked end-to-end and could not have. Details in §B.

---

## A. What I could verify

### The site is live and current — CONFIRMED

```
GET https://plumber-cherny.netlify.app/            → 200
GET https://plumber-cherny.netlify.app/register.json → 200
```

Live register is **byte-identical to `public/register.json` at repo HEAD**:
version `2026-08-28-act`, 60 entries, all `status: verified`. Serving headers are
correct (`application/json; charset=utf-8`, `max-age=60, must-revalidate`).

So static publishing from git works. Nothing below is a deploy problem.

### Q9, Q11, Q12 — no scheduled run has ever published — CONFIRMED

`last_run` is **absent** from the live register. And the authorship proves why:

| `verified.by_agent` | Entries |
|---|---|
| `build-agent-2026-07-31` | 29 |
| `pointer-agent-2026-08-27` | 30 |
| `act-verify-2026-08-28` | 1 |

Dates distribute 31 Jul (29) / 27 Aug (30) / 28 Aug (1) — exactly the three
occasions a **human-run script** wrote the register. There is no `agent-*`
value anywhere. The scheduled agent has never successfully written.

Q11's premise is right, and the answer is not "the weekly run didn't refresh
them" — it is "no weekly run has ever completed and published."

### Q16, Q17, Q18, Q24 — the root/public split — CONFIRMED, CRITICAL

This is the most serious finding and it is exactly as you suspected.

- `_load_register()` prefers **root** `register.json`
- `_git_publish` commits `REGISTER_PATH_IN_REPO`, **defaulting to
  `register.json`** (root)
- the site serves **`public/register.json`**
- the build command is `verify_register.py --offline`, which I confirmed
  **performs no writes** — it is a pure gate
- there is **no copy step** anywhere in `netlify.toml`

So a fully successful agent run would commit root `register.json`, trigger a
rebuild, and publish `public/` — which still contains the *old* register. **The
update would never reach a user, and the two files would silently diverge.**

They are identical today only because my `add_*.py` scripts write both. The
agent writes one.

**Authoritative:** `public/register.json` is what users get;
`register.json` is what the agent reads and writes. That split is the bug.

### Q7 — the deployed function probably cannot import the gate — CONFIRMED as a risk

The function does:

```python
_SCRIPTS = os.path.normpath(os.path.join(_HERE, "..", "scripts"))
sys.path.insert(0, _SCRIPTS)
import verify_register as vr
import fsutil
```

`netlify.toml` has **no `included_files` directive**, so `scripts/` is very
likely not in the deployed function bundle. On failure the module sets
`_IMPORT_ERROR`, and `reverify_all()` raises
`RuntimeError: could not import verify_register: …`, which the handler returns
as a **500 with a traceback**.

Confirmed: the code path exists and there is no bundling directive.
**Unverifiable here:** whether Netlify actually excluded it. Function logs would
show that exact RuntimeError.

### Q5, Q6, Q38 — the 30-second limit — CONFIRMED, fatal

The file is `verify_register_scheduled.py`, **not** `-background.py`, so it
deploys as a **synchronous** scheduled function with Netlify's 30 s ceiling.

I timed a full live verification just now:

```
exit 0 — 60/60 confirmed — elapsed 56.7 s
```

That is on a fast local connection **with zero Cloudflare challenges**. Netlify's
runtime will be slower, not faster. **56.7 s against a 30 s limit: it cannot
finish.** Q6's premise is correct — it can't, as deployed.

### Q23 — a failed publish loses the run — CONFIRMED

The sidecar is written to `reg_path.replace(".json", ".proposed.<run>.json")` —
inside the function's ephemeral filesystem. If the git publish fails, that file
dies with the instance. The run's verdicts are **lost**, with nothing persisted
and nothing raised.

### Q32, Q33 — no gate between compute and publish — CONFIRMED

The agent imports only `vr.fetch_ex`, `vr.is_official`, `vr.same_url`. It
**never invokes the publish gate**. It publishes its own computed result.

In practice it cannot publish a false `verified`, because its own logic flips any
entry it could not confirm. But nothing independently checks that before the
commit, and the post-commit build gate runs `--offline`, so it would not catch a
lie either. The canonical register is untouched *locally* (sidecar), but the git
publish writes the canonical repo file with no intervening gate.

Answering Q33 precisely: **no** — "untouched until the proposed result passes its
gate" is not what happens.

### Q22 — git conflicts — CONFIRMED (this part is sound)

`_git_publish` fetches the file `sha`, PUTs with it, and on **409** re-fetches
and retries up to 3 times with linear backoff; 404 likewise. Publishing is
wrapped in an advisory `fsutil.file_lock` with a 60 s timeout, and a lock
timeout skips gracefully. This is the best-built part of the agent.

### Q34 — monitoring — CONFIRMED: none exists

There is no alerting, no notification, and no overdue detection anywhere. A
silently dead schedule is invisible. See Q15 below — this is the real hazard.

### Q39 — headers missing on `/` — CONFIRMED

```
GET /            → no x-content-type-options, no referrer-policy
GET /index.html  → both present
```

Your diagnosis is right: the `for = "/*.html"` rule does not match the bare `/`
path. Add a `for = "/"` rule (or `/*`).

### Q37 — README is stale — CONFIRMED

`README.md:128` still says the build "runs the live publish gate". `netlify.toml`
runs `--offline`. **`netlify.toml` is authoritative** — and the offline choice is
deliberate: Netlify's build servers are reliably 403'd by Cloudflare on
`bpc.vic.gov.au` (`LESSONS-LEARNED.md` §1). I corrected this in the code comments
and missed the README line. My error; it should be fixed.

### Q40, Q41 — no automated tests — CONFIRMED

No test files of any kind. Validation is entirely the manual runbook. Every item
you list in Q41 is worth having, and the register-mirroring and missed-run
freshness tests would have caught two of the three blockers above.

### Q10, Q13, Q14, Q15 — the UI conflates two different things — you are right

"Live data" and "Up to date" describe **the download**, not the verification.
"Last checked" describes verification. Showing "Up to date" beside "Last
checked —" is therefore internally consistent but genuinely misleading, exactly
as you say.

My recommendations, for Walter's decision:

- **Q14: yes.** Rename the network-state pill so it cannot be read as a freshness
  claim.
- **Q13:** with no completed run, say so plainly — "Never checked" — not "—".
- **Q15:** fail closed at **14 days** (two missed weekly cycles). One missed run
  is a transient; two is a broken pipeline. Past that the app should show
  *Verification overdue* and stop presenting per-entry "Verified on" as current.

This is the same fail-closed principle already applied per-entry, applied to the
register as a whole. Without it, a dead schedule leaves 60 entries displaying
"Verified on 2026-07-31" indefinitely — the precise failure the product exists to
prevent, one level up. **I consider this the most important product fix in your
list.**

### Q35, Q36 — stale documentation — CONFIRMED

Stale: the README live-gate line (Q37); `TEST-AND-VERIFICATION-LOG.md` §3 items
saying the schedule and git publishing are "not yet observed" should now say
**observed failing**, not merely unobserved; `SPEC.md`'s acceptance row for the
schedule should read **not met** rather than "met in code".

---

## B. Root cause of the missing `last_run`

**Three independent, individually sufficient blockers.** This was never one bug.

1. **Time.** Synchronous scheduled function, 30 s limit, 56.7 s of work measured.
   Cannot complete.
2. **Imports.** `scripts/` is almost certainly not in the function bundle
   (no `included_files`), so the module raises before doing any work.
3. **Plumbing.** Even a perfect run commits root `register.json` while the site
   serves `public/register.json`, with no copy step. Invisible to users.

Fix any one and it still fails. Fix all three and it works.

**One prior question, which may make the others moot — check this first:**
confirm Netlify actually runs a **Python** function here. Python is not one of
Netlify Functions' standard runtimes. If it is unsupported on this plan or
configuration, the function was never deployed at all, and that is the simplest
explanation for total silence. I cannot check this without the dashboard; the
Functions list in the Netlify UI settles it in seconds.

---

## C. Exact repair

Ordered. Do not skip 0.

0. **Confirm the function is deployed at all** (Netlify → Functions). If Python
   is not a supported runtime here, stop and re-host the agent — everything below
   is wasted otherwise.
1. **Make it a background function** — rename to
   `verify_register_scheduled-background.py`. The handler signature is
   identical; the comments already anticipate this. 15-minute ceiling against
   56.7 s of work.
2. **Bundle the shared code** — add `included_files` for `scripts/**` so
   `verify_register.py` and `fsutil.py` are importable, or vendor them into
   `functions/`. Do **not** duplicate the logic; one implementation.
3. **Fix the register plumbing.** Pick one:
   - commit **both** paths (set the publisher to write root and `public/`), or
   - set `REGISTER_PATH_IN_REPO=public/register.json` and have the agent read
     the same file, or
   - add a build step that copies root → `public/` before publish.

   Whichever you choose, **the agent must read and write the same file the site
   serves.** My preference is the third: one authoritative file, copied at build,
   so the two can never drift.
4. **Gate before publish** — have the agent run the structural/consistency gate
   over its proposed register before committing, so §A/Q33 becomes true.
5. **Persist a failed run** — if the publish step fails, the verdicts must not
   die with the instance. At minimum, log the full summary.
6. **Add the freshness fail-closed** (Q15) and rename the network pill (Q14).
7. **Fix the `/` headers** (Q39) and the README line (Q37).
8. **Add the tests in Q41**, starting with register mirroring and missed-run
   freshness.

---

## D. Evidence the repaired cycle works

**I cannot provide this, and neither can you until the repair is applied.** The
honest position: the cycle has never run, so there is no evidence to produce.

The acceptance test is gates 7–11 in `BOLT-MIGRATION-BRIEF.md` §5, plus:

- a scheduled invocation appears in the Netlify function log
- `last_run` appears in the **served** `public/register.json`
- Settings → Last checked shows that date
- deliberately falsify one `key_substring`, wait for a run, and watch it flip to
  `unverified` with evidence, then restore it

Until `last_run` appears in the *served* register, the cycle is unproven.

---

## E. Bolt architecture — Q43 to Q58

Same discipline as the migration brief: I will not guess what Bolt provides.

**Q43 — recommendation: split.** Bolt for the app, auth, database and Stripe;
**keep the verifier where it can actually run**, initially Netlify (repaired) or
any scheduled runtime you control. Reasons:

- The verifier is 484 lines of gate plus 386 of agent, with a hard dependency on
  a network path gov.au will serve. That is the riskiest thing to move and the
  least related to a paid pilot.
- Q58's answer follows: **the smallest sequence to a paid pilot does not touch
  the verifier at all.** Move the page, add auth/entitlement, keep consuming the
  register the verifier already publishes.
- Moving both at once means debugging Cloudflare egress and a payments flow
  simultaneously.

**Q44–Q51** are the same open questions as the brief §4 and I decline to guess
them. Q48 deserves emphasis: **test egress before committing to a host.**
Netlify's build servers are already 403'd by Cloudflare on `bpc.vic.gov.au`; a
new host may be too. That is a five-minute test and it should gate the decision.

**Q49 — per-host session reuse** is not optional. One `requests.Session` per
hostname took the pass rate from ~25% to ~100%. Any port must preserve it.

**Q52 — preventing an ungated register being served:** the gate must sit between
the agent and the served artefact, wherever they live. Today it does not (§A/Q33)
— fix that during the migration rather than porting the flaw.

**Q53 — this is the one that needs real thought.** `register.json` is currently
public and cacheable. Subscription-gating the app while leaving the register at a
public URL gates nothing. If access is to be paid, the register must move behind
an authenticated endpoint, which changes the app's single `fetch("register.json")`
and its offline cache story. **Decide this before building payments, not after.**

**Q54 — Stripe entitlement must be enforced server-side**, on the endpoint that
serves the register. A client-side check is decorative.

**Q55 — my read:** bookmarks and reviewed-markers are worth syncing across
devices. Notes probably. Classic-mode preference, filter hint state, last-viewed
and visit counters should stay local — they are per-device conveniences and
syncing them adds schema and backup burden for no user benefit.

**Q56 — you are right that Bolt project history does not restore database
state.** Whatever holds subscriber and entitlement data needs its own backup and
a tested restore. Untested restore is not a backup.

**Q57 — preserved by treating them as acceptance criteria**, not aspirations:
`BOLT-MIGRATION-BRIEF.md` §3 lists them and §5 gates them.

---

## F. Unresolved — needs Walter

1. **Q53 — is the register public or paid?** Determines the entire data path.
   Everything else in the Bolt plan depends on this answer.
2. **Q15 — the overdue threshold.** I recommend 14 days. It is a product
   judgement about how stale is too stale to keep showing a verified badge.
3. **Where the verifier runs** if not Netlify. Requires an egress test against
   Cloudflare-protected sources.
4. **Whether to repair Netlify at all**, or move the verifier straight to its
   final home. Repairing first gives a working weekly cycle and real evidence;
   moving first avoids doing the work twice.

---

## G. Unverifiable without dashboard access

Q1 (deployed SHA — though the served register matches repo HEAD), Q2, Q3, Q4,
Q5 (filename implies synchronous; deployment config is the truth), Q8, Q19,
Q20, Q21, Q25, Q26, Q27, Q28, Q29, Q42.

All of them are answered by two things: the **Netlify Functions list** (is it
deployed, sync or background) and the **function logs for Monday 31 August
2026** (did it fire, what did it say). Given the three blockers in §B, my
expectation is that the log shows either nothing at all or an import
`RuntimeError` — but that is an expectation, not evidence, and I have marked it
as such.
