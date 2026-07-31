# Manus Task — Roof Drainage Rule Watcher (capability demo, v2 — VIC + Federal expansion)

Paste this whole file into a new Manus task. Attach `roof-watch-register.seed.v2.json` (below).

## Intent
Build the **simplest possible listener**: a page that tells a Victorian roofing (stormwater)
plumber whether the rules their work depends on — across **both Victorian and federal
instruments** — are **still current**. Each rule shows as *verified* or *needs recheck*, and
behind it a scheduled agent actually **opens the source page and reasons** about whether the
claim still holds.

This is a **demo of three capabilities**, not a product. Do not build a design checker, rule
engine, accounts, uploads, or AI intake. One page + one scheduled agent + one register file.
Choose your own stack, hosting, and structure — I only care that the three capabilities below are
real and visible.

## What changed from v1
The original brief covered six claims, all effectively state-level (BPC/NCC/WorkSafe). This
version extends the register to **13 claims spanning two levels of government** — Victorian
statutory instruments and regulator guidance, plus Commonwealth-level standards and consumer law
that apply to the same trade regardless of state. The three-capability architecture is unchanged;
only the register content grows.

## The three capabilities this must prove
1. **Platform scheduling (not in-process timers).**
   Run weekly on Manus's managed schedule (Heartbeat / AGENT cron). No `setInterval`/`setTimeout`
   loops that die when the instance is torn down. The handler must be **idempotent**, look work up
   by the platform-provided task/run id (never trust the request body), and be **deployed before it
   is scheduled**.
2. **Agentic verification (not byte-diffing).**
   Each scheduled run spins up a Manus agent with web browsing. For every claim in the register it
   opens the source URL and **reasons** about whether the recorded assertion still holds — the
   edition string, the dollar threshold, the clause reference, the regulator's name, the statutory
   cap, the warranty period. It returns a reasoned verdict plus a short supporting quote from the
   page. It must NOT simply hash the HTML and compare bytes.
3. **Verification register (the trust primitive).**
   A persistent JSON file is the single source of truth. Each record holds the claim, the value it
   asserts, the jurisdictional level (`VIC`, `Federal`, or both), the edition/date it was last
   checked against, and `verified: { against, on, by }`.
   - When the agent confirms the claim → set/refresh `verified` with today's date and the agent id.
   - When the agent finds the source changed so the claim **no longer matches** → **auto-flip the
     item to `unverified`**, record what changed and the quote that proves it. Never silently keep
     a stale `verified`.
   - A **publish gate** refuses to output a register in which any item is marked `verified` but was
     not confirmed by the latest run (e.g. its `edition`/value moved but the check didn't re-pass).

## Done when (acceptance)
- `register.json` exists with all seeded claims, each `verified` block populated by a **real agent
  run** against the live URLs.
- If a source no longer matches (test this by pointing one claim at a deliberately wrong expected
  value), that item flips to `unverified` with a recorded reason — and the publish gate blocks it.
- The weekly schedule is registered on the Manus platform; the handler is idempotent and keyed on
  the run id.
- A single page renders each claim as **verified (with against / on / by + evidence quote)** or
  **needs recheck (with what changed)**, grouped or tagged by jurisdictional level (VIC vs
  Federal) so a viewer can see at a glance which layer of government a rule sits at. Nothing
  fancier.

## Data I am providing
The watch-list below (also attached as `roof-watch-register.seed.v2.json`) — thirteen concrete
claims spanning Victorian and federal instruments relevant to roofing (stormwater) work. This is
the agent's job list. Verify each against its URL; the "how to decide" column is the pass/fail
test.

### Victorian instruments and regulator guidance

| id | claim (asserts) | source URL | fails if |
|----|-----------------|------------|----------|
| RS-STANDARD | BPC-mandated stormwater edition is **AS/NZS 3500.3:2025** | https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/updated-plumbing-and-drainage-standards-asnzs-3500-series/updated-plumbing-and-drainage-standards-part-3-stormwater-drainage | page names a different edition or a newer amendment |
| RS-VALLEYGUTTER | Valley-gutter deemed-to-satisfy catchment limit is **40 m2** (Clause 3.6, raised from 20 m2 in the 2021 edition) | https://www.bpc.vic.gov.au/__data/assets/pdf_file/0026/9908/View-slides-Part-3.pdf | current edition states a different limit or clause number |
| RS-EAVESOVERFLOW | Appendix F eaves-gutter overflow design (up to **400 m2** catchment, **1% AEP**) is now **mandatory** | https://www.bpc.vic.gov.au/__data/assets/pdf_file/0026/9908/View-slides-Part-3.pdf | Appendix F is no longer mandatory, or catchment/AEP figures change |
| CERT-THRESHOLD | Compliance certificate required where total work value **exceeds $750** | https://www.bpc.vic.gov.au/plumbers/delivering-safe-and-compliant-plumbing/compliance-certificates | threshold figure has changed |
| PLUMB-REG18-DIV7 | Roofing (stormwater) work definition sits under **Division 7**; standards under **Schedule 2 Division 5** (referencing SA HB 39 and SAA/SNZ HB 114) of the **Plumbing Regulations 2018**, which sunsets **2 October 2028** | https://www.legislation.vic.gov.au/in-force/statutory-rules/plumbing-regulations-2018/018 | division numbering, referenced handbooks, or sunset date change, or the instrument is remade |
| FALLS-2M | WorkSafe falls duties trigger for work **above 2 m** (OHS Regs 2017) | https://www.worksafe.vic.gov.au/resources/compliance-code-prevention-falls-housing-construction | height trigger changes |
| ASBESTOS-OHSREG-PT44 | Asbestos removal duties sit under **Part 4.4, OHS Regulations 2017**; unlicensed non-friable removal capped at **10 m2 total** and **1 hour cumulative per 7-day period** | https://www.worksafe.vic.gov.au/case-study-asbestos-removal-domestic-demolition | area cap, time cap, or part number change |
| ASBESTOS-NOTIFY-DGACT | Under **Dangerous Goods Act 1985 Pt VIA**, notify WorkSafe on becoming aware of asbestos installed on/after **1 Jan 2004** (non-domestic only), enter agreement within **60 days** | https://www.worksafe.vic.gov.au/properties-containing-asbestos-notification-and-plans | cutoff date, agreement period, or domestic exemption change |
| POWERLINE-APPROACH | Safe approach distances for roof/gutter work near live overhead powerlines set under **AS 2550.1** and Energy Safe Victoria guidance | https://www.energysafe.vic.gov.au/community-safety/energy-safety-guides/powerline-safety | referenced standard or responsible regulator changes |
| WARRANTY-DBCA95 | Implied warranties on domestic building/roofing work run **10 years** from completion under the **Building Act 1993**, per the **Domestic Building Contracts Act 1995** | https://www.consumer.vic.gov.au/licensing-and-registration/builders-and-tradespeople/running-your-business/warranties-and-insurance/implied-warranties-on-home-building-work | warranty period or governing Act reference changes |
| REGULATOR | Victorian plumbing regulator is the **BPC**, which replaced the VBA on **1 July 2025** | https://www.planning.vic.gov.au/guides-and-resources/building-policy/building-reform | regulator identity changes again |

### Federal (Commonwealth) instruments adopted into or applying alongside Victorian practice

| id | claim (asserts) | source URL | fails if |
|----|-----------------|------------|----------|
| NCC-GUTTERS | Low-rise gutters/downpipes governed by **NCC 2022 Housing Provisions Pt 7.4** | https://ncc.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/7-roof-and-wall-cladding/part-74-gutters-and-downpipes | a newer NCC edition supersedes 2022, or Pt 7.4 is renumbered |
| BOXGUTTER-CARVEOUT | Box gutters carved out of the deemed-to-satisfy path via **H2D6(3)** | https://www.abcb.gov.au/news/2022/new-ncc-2022-requirements-gutters-and-downpipes | provision reference changes |
| ACL-GUARANTEES | Consumer guarantees under the **Australian Consumer Law** (Sch 2, Competition and Consumer Act 2010, Cth) apply and **cannot be excluded** by contract | https://www.consumer.vic.gov.au/licensing-and-registration/builders-and-tradespeople/running-your-business/warranties-and-insurance/implied-warranties-on-home-building-work | ACL's non-excludability of these guarantees changes |

All thirteen are verified as at **July 2026** in my baseline. Treat that as the starting
`verified.on`.

## Notes
- This is a demonstration built on a curated regulatory baseline; the agent verifies real public
  pages but the app makes no compliance determination.
- The register now spans two jurisdictional levels deliberately — this proves the architecture
  generalises beyond a single-state, single-regulator watch list, which matters for later
  cloning to other states/trades.
- Keep the register human-readable — thirteen items is the whole dataset; do not silently drop the
  original six while extending it.
