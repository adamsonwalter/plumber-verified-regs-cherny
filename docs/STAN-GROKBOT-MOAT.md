# Stan / Grok Bot — persistent VM, egress moat, product uses

Canonical notes for every coder on this product (Cursor, Claude, Grok, Bolt).
Measured 2026-09-03. Do not “correct” these from training data.

Walter does not run CLI. Give him **paste-ready jobs** for **Stan** (Grok Bot
orchestrator). Stan’s computer is a **24×7 Grok Bot VM**, not a laptop session
and not a one-shot Cursor cloud Task.

---

## 1. What Stan is

| Thing | What it is |
|---|---|
| **Grok Bot VM** | Always-on cloud computer (files, browser, terminal, routines). Survives laptop close. |
| **Stan** | Walter’s orchestrator bot on that VM. |
| **Cursor cloud Task** | Throwaway job VM. **Not** Stan. Ours was AWS us-east-1 and **failed** BPC. |

Do not tell Walter that Grok Bot cannot stay up. Persistence is the product.

---

## 2. The moat (not widely known)

Weekly **verbatim** checks of Cloudflare-protected **guidance pages** are the
product. Most “serverless / CI” hosts **cannot fetch those pages**.

A competitor who ships “verified this week” from GitHub Actions, Netlify
Functions, Vercel cron, or a generic AWS/Azure box will get Cloudflare 403s
on BPC and will either lie in the UI or drop the schedule. **That failure is
the default.** Clearing it is the scarce asset.

Stan’s VM egresses as **Cloudflare’s own ASN** and **does** get the pages.
That is an operational advantage, not a clever User-Agent.

Verification must stay **deterministic substring matching** (`key_substring` +
`also_requires`). Do not put an LLM in the publish gate.

---

## 3. Measured egress (same Python, `scripts/egress_report.py --strict`)

| Network | IP / ASN | `bpc.vic.gov.au` | `planning.vic.gov.au` |
|---|---|---|---|
| Walter home (iiNet/TPG Melbourne) | `124.170.123.36` AS7545 | 46/46 OK | 0/1 CF (that pass) |
| GitHub-hosted Actions | Azure | **0/46 CF** | OK |
| Cursor cloud Task | `18.235.67.204` AS14618 AWS us-east-1 | **0/46 CF** | 0/1 CF |
| **Stan Grok Bot VM** | `104.30.175.37` **AS13335 Cloudflare US** | **46/46 OK** | **OK** |

Stan: ~100.5s, all 60 URLs, repo script on branch
`migration-plan-and-egress-test`. Auto-review only blocked a `/usr/bin/time`
wrapper; same script re-ran.

**Do not buy AWS/Azure droplets hoping they match Stan.** Cloudflare-to-BPC
worked; generic US datacentre did not.

DataVic (`discover.data.vic.gov.au`) is reachable everywhere we tried. It does
**not** carry AS/NZS 3500 / class-scope **prose**. No substitute for BPC HTML.
Practitioner Register datastore (~48k rows) is a **separate paid feature**,
not weekly verification.

46 BPC entries collapse to **14 URLs**. Fetch per URL, assert per entry.

---

## 4. Business uses of this moat

Charge for **maintained freshness**, not for copying the statute.

1. **Weekly verified trade register** (this app) — $9/month thesis: “is it up
   to date?” Stan can actually check BPC. Hosts that cannot must not show a
   green badge.
2. **Change warnings** — substring gone → `unverified` with evidence. Unique
   if the fetch works every week.
3. **Same pattern, other Cloudflare-fronted official pages** — other
   Victorian/federal guidance that CI cannot read. Only after an egress probe
   from **Stan**, not from GitHub-hosted.
4. **DataVic practitioner / permit feeds** — official, unchallenged APIs.
   “Is this builder registered?” is a bolt-on, not a BPC-text replacement.
5. **Unattended ops** — Stan already has the machine. GitHub-hosted cron is
   the wrong runner for BPC.

Repo is public today (`raw.githubusercontent.com` serves `register.json`).
Paid app + public JSON gates nothing. Decide visibility before Stripe.

---

## 5. How coders must work with Stan

- **Egress jobs** run on Stan. Cursor/Claude write the paste; Walter pastes.
- **First** `egress_report.py --strict` from **that** VM. Then
  `verify_register.py --live`. Probe ≠ publish.
- Publish only after the live gate. Write **both** `register.json` and
  `public/register.json` (or only the served path). Sidecar-only is not a
  ship.
- Do not rename Netlify Python functions. Python Functions never deployed.
- Do not use TLS impersonation libraries as the weekly guarantee.
- UI: no “Up to date” / “Live data” as freshness. Fail closed at 14 days
  without `last_run`.

### Paste template (Walter → Stan)

```
Job: on THIS Grok Bot computer only. I do not use CLI. Do not commit or
push unless I say publish. Do not change plumber-cherny.netlify.app.

1. Clone https://github.com/adamsonwalter/plumber-verified-regs-cherny
   branch migration-plan-and-egress-test (or the branch I name).
2. Install requirements.txt.
3. Report this machine’s public IP, country, ASN/org.
4. Run: python scripts/egress_report.py --retries 3 --timeout 20 --strict
5. If I asked for the live gate and the probe passed BPC: run
   python scripts/verify_register.py --live and report exit code and counts.
6. Reply in plain English: IP/ASN; BPC 46 OK vs CF; Planning; elapsed;
   usable as weekly verifier? (yes only if BPC succeeded)

If Auto-review holds a wrapper (time, redirects), re-run the same script
without the wrapper. Do not skip URLs.
```

---

## 6. Current operating cadence — manual, weekly, Monday 5pm Melbourne

**As of 2026-09-07, this is a manually paste-triggered run, not an unattended
schedule.** Nothing on Stan's VM currently fires itself — Walter pastes the job
in §5, once a week.

- **Cadence: Mondays, 5:00 PM Melbourne time (AEST/AEDT).** Chosen by Walter,
  not derived from anything in this repo.
- Coincidentally close to the *never-executed* Netlify cron this replaces —
  `netlify.toml`'s `schedule = "0 7 * * 1"` is Monday 07:00 UTC, i.e. Monday
  5pm AEST / 6pm AEDT. The original design intent and Stan's actual cadence
  land on the same slot.
- **First real pass: 2026-09-03** (Thursday, off-cycle — the initial proof run
  from the egress test, not yet on the Monday slot). `last_run.on` in the
  register will show the real date each week.
- **This is a placeholder cadence for a pre-paid product**, not a commitment.
  Once there are paying customers, weekly may not be enough fidelity for
  what they're paying for — a rule can change any day, and "checked last
  Monday" is a weaker claim than a subscriber may expect from "$9/month
  maintained service" (`MIGRATION-PLAN.md` §2.4). Revisit cadence once real
  usage data exists (`MIGRATION-PLAN.md` §2.9, the paid pilot) — daily, or
  on-demand-plus-weekly, are both plausible upgrades and both cost is the
  same paste job run more often, not new engineering.
- **Until the schedule is truly unattended** (§2.2's blocked GitHub Actions
  path, or Stan's VM running its own cron rather than being pasted into),
  every week depends on Walter remembering to paste the job. That is a
  single point of failure worth naming plainly rather than obscuring behind
  "Stan verifies weekly" language — it is closer to "Stan verifies when
  asked, currently asked weekly."

---

## 6a. Open — verify next Monday's run actually happened

Written 2026-09-07 (Monday), ~2:30pm AEST — **before** the 5pm slot this note
describes. Nothing below is evidence of anything; it is a placeholder to
check against, deliberately written ahead of the event it's checking.

**Check next session, when Walter is back at his desk:** did the 2026-09-07
5pm run happen?

```bash
python3 -c "import json;print(json.dumps(json.load(open('register.json'))['last_run'],indent=2))"
```

- If `last_run.on` reads **2026-09-07**: it ran. Confirm `counts` is
  `{verified: 60, unverified: 0, unreachable: 0}` (or investigate any
  `unreachable`/`unverified` entries per `REPEATABLE-VALIDATION.md` §9), and
  confirm it reached both `register.json` and `public/register.json` and
  matches what `plumber-cherny.netlify.app/register.json` serves.
- If `last_run.on` still reads **2026-09-03**: the Monday run did not happen —
  most likely because nobody pasted the job (see the single-point-of-failure
  note in §6 above). Not a code defect; a process gap. Flag it back to
  Walter rather than silently treating stale data as current.

Delete this subsection once the check is done and its outcome is folded into
§6 (or into a "missed run" note if it didn't happen).

---

## 7. Related

- Sequence: [`MIGRATION-PLAN.md`](MIGRATION-PLAN.md) §2.0a
- Host move: [`BOLT-MIGRATION-BRIEF.md`](BOLT-MIGRATION-BRIEF.md)
- Fetch pitfalls: [`LESSONS-LEARNED.md`](LESSONS-LEARNED.md)
