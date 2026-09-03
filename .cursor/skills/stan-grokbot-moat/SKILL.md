---
name: stan-grokbot-moat
description: >
  Uses Walter's always-on Grok Bot VM (orchestrator Stan) for Cloudflare-protected
  official-page fetches that GitHub Actions, Netlify Functions, and AWS/Azure VMs
  cannot perform. Captures the measured egress moat, paid freshness product, and
  paste-ready Stan jobs because Walter does not run CLI. Use when the user mentions
  Stan, Grok Bot, Grokbot, weekly verification, BPC, Cloudflare 403 on gov.au,
  GitHub-hosted runners, last_run, Bolt migration of this register, DataVic
  practitioner register, or “is it up to date.” Do not treat Cursor cloud Tasks as Stan.
---

# Stan / Grok Bot moat

Read [`docs/STAN-GROKBOT-MOAT.md`](../../../docs/STAN-GROKBOT-MOAT.md) if this
repo is the plumber register. If not, the rules below still apply.

## Invariants

1. **Grok Bot VMs run 24×7.** Persistence is the product. Cursor cloud Tasks are
   ephemeral and are a different machine.
2. **Stan (2026-09-03)** egress `104.30.175.37` **AS13335 Cloudflare**: BPC
   **46/46 OK**, Planning OK, `egress_report.py --strict`, ~100s.
3. **GitHub-hosted Azure** and **AWS us-east-1** Cursor Task: BPC **0/46** CF.
   Do not schedule BPC fetches there. Do not sell a US droplet as the fix.
4. **Probe ≠ publish.** Egress pass does not write `last_run`. Live gate then
   gated write to the **served** register (both JSON paths).
5. **Gate stays deterministic.** No LLM in the publish loop.
6. **Walter = paste only.** Write complete Stan jobs. Never “run this curl.”
7. DataVic is not BPC guidance text. Practitioner API is a later paid feature.
8. Netlify Python Functions never deployed. Do not “repair” them.

## When asked to verify or migrate

- Run or instruct Stan to run `scripts/egress_report.py --strict` **on Stan**.
- UI must not claim freshness without `last_run`. 14-day overdue fail-closed.
- Public GitHub `register.json` means a paywall on the app is not a paywall on
  the data unless the repo policy changes.

## Stan paste

Use the template in `docs/STAN-GROKBOT-MOAT.md` §5. If Auto-review holds a
`time`/redirect wrapper, same script without the wrapper — do not skip URLs.
