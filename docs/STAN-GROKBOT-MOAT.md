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

### Changing what the gate enforces — a two-party change

Stan and this repo are **two independent writers to `main`**. Stan runs from a
checkout he pulled; the publish gate runs in Netlify's build. So any change to
*what the gate enforces* is not a code change — it is a coordinated change
across both, and getting the order wrong wedges production.

**The failure mode, hit for real on 2026-09-08.** The register version scheme
changed here (`register_version` gained a mandatory monotonic
`register_serial`), and the gate was tightened to reject a register without
one. Stan published `e996d6b` from a checkout predating that change, so his
register arrived with no serial. Left alone that would have blocked **every**
subsequent Netlify build, freezing the live site on stale data — a stuck state,
not a soft failure, because the gate refuses the register already on `main`.

**The sequence that works** (proven end-to-end 2026-09-08):

1. **Land code, gate and data in one commit.** Never a commit where the gate
   would reject the register sitting beside it. When a schema change needs
   existing data migrated, seed it in the same commit — here, Stan's live
   register was taken as-is and given `register_serial: 1`, keeping *his* date
   and run attribution, since the content was his verification and only the
   identity scheme was new.
2. **Tell Stan four things explicitly**: the SHA to pull, what changed, what
   breaks if he does not, and the exact error he would see. Not "please pull".
3. **Stan pulls, runs, publishes** from that checkout.
4. **Verify independently.** Read the register from `origin/main` *and* the
   live URL yourself. A report of success is not the evidence; the served
   artefact is.

**Worked example — the version-serial change**

| Step | Evidence |
|---|---|
| Code + gate + seeded data | `399b292`, register `2026-09-08-agent.1`, serial 1 |
| Stan pulled to that SHA and ran | 60 / 0 / 0, offline gate exit 0, both files identical |
| Stan published | `b3dac12`, register `2026-09-08-agent.2`, **serial 2** |
| Independently confirmed | `origin/main` = `b3dac12`; version ends with its serial; `last_run` `agent-2026-09-08-l-1788834901`; live URL serving `2026-09-08-agent.2` |

The serial stepping `1 -> 2` **through Stan's own agent path** is the proof that
mattered — unit-testing the bump helper and running the gate locally proves the
code, not the circuit.

Stan then added a **pre-push check** that refuses a push when serial and version
disagree. That is the right shape: it moves the gate's rule ahead of the commit,
so a rejected register never reaches `main` to block builds in the first place.
Prefer this for future gate rules — enforce at Stan's push as well as at build.

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

## 6a. Resolved — the 2026-09-07 run did happen

This subsection was a placeholder written before the 5pm slot it was checking.
Outcome, folded in and the placeholder retired:

- **2026-09-07 ran.** Published as `a25ab4d`, `last_run.on` 2026-09-07,
  60 / 0 / 0, reaching both register files and the served site.
- **One trap worth remembering when reading commit times.** The commit is
  stamped `2026-09-07T07:07:17+00:00` — that is **UTC**, i.e. 17:07 AEST, the
  5pm slot exactly as intended. Read with a local-time formatter it looks like
  07:07 and invites a false "the scheduler fired at the wrong time" conclusion.
  It did not. Always read these with an explicit offset (`--date=iso-strict`).
- **2026-09-08 also ran** (twice, deliberately: `e996d6b` then `b3dac12` after
  the version-serial change), so the cadence is now demonstrated across
  consecutive days rather than a single sample.

The cron is `0 7 * * 1` — 07:00 UTC Monday, 17:00 AEST the same Monday, so the
UTC-derived `last_run.on` matches the Australian day. It would only drift if a
run moved past 14:00 UTC, where the two calendar days diverge and an entry could
be stamped a day behind what a Victorian plumber sees.

**Guarded on both sides as of 2026-09-08.** Stan has pinned Monday 07:00 UTC in
his weekly clock and will warn before accepting any reschedule past 14:00 UTC,
rather than silently shifting the stamp a day. So this is not merely a note to
remember — there is a live check on his end. If the slot ever does need to move,
the fix is to derive `last_run.on` from Melbourne time rather than UTC, not to
accept the drift.

---

## 7. Related

- Sequence: [`MIGRATION-PLAN.md`](MIGRATION-PLAN.md) §2.0a
- Host move: [`BOLT-MIGRATION-BRIEF.md`](BOLT-MIGRATION-BRIEF.md)
- Fetch pitfalls: [`LESSONS-LEARNED.md`](LESSONS-LEARNED.md)
