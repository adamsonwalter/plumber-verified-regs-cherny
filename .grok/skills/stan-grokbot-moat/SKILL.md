---
name: stan-grokbot-moat
description: >
  Always-on Grok Bot VM (Stan) can fetch Cloudflare-protected BPC/gov.au guidance
  that GitHub Actions and AWS/Azure cannot. Use for weekly verification, egress
  probes, last_run publish, Stan paste jobs, and paid freshness / DataVic add-ons.
  Triggers on Stan, Grok Bot, Grokbot, BPC, Cloudflare 403, weekly verifier.
  Use when the user runs /stan-grokbot-moat.
---

# Stan / Grok Bot moat

You are on (or writing jobs for) Walter's **persistent Grok Bot computer**.
It is not a laptop and not a Cursor cloud Task.

## Measured (2026-09-03)

Stan ran `.venv/bin/python scripts/egress_report.py --retries 3 --timeout 20 --strict`
on `plumber-verified-regs-cherny` branch `migration-plan-and-egress-test`:

- IP `104.30.175.37` AS13335 Cloudflare US
- `www.bpc.vic.gov.au` **46/46 OK**
- `www.planning.vic.gov.au` **OK**
- ~100.5s, all 60 URLs
- Wrapper hold: drop `/usr/bin/time` and redirects; **same script**

GitHub-hosted and AWS Cursor Tasks: BPC **0/46**. Home iiNet: BPC OK, Planning
flaked once.

Full notes: `docs/STAN-GROKBOT-MOAT.md` in that repo.

## Do

- Weekly: `verify_register.py --live` on **this** VM after a passing probe.
- Publish only if the gate exits 0; write both register JSON paths.
- Plain-English reports for Walter. He does not run CLI.
- Keep substring gates; never LLM-approve a claim.

## Do not

- Commit/push unless Walter says publish.
- Skip BPC URLs after an Auto-review hold.
- Treat DataVic datasets as the 3500/class-scope text.
- Assume AWS/Azure VPS will match this Cloudflare egress.
