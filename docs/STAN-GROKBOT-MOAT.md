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

## 6. Related

- Sequence: [`MIGRATION-PLAN.md`](MIGRATION-PLAN.md) §2.0a
- Host move: [`BOLT-MIGRATION-BRIEF.md`](BOLT-MIGRATION-BRIEF.md)
- Fetch pitfalls: [`LESSONS-LEARNED.md`](LESSONS-LEARNED.md)
