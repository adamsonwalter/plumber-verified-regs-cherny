# Specification — Verified Plumbing & Roofing Regulations Register

What this system is, what it must prove, and the rules governing what may enter
the register. Describes the system **as built**; where the implementation
diverges from the original intent, the divergence is stated rather than hidden.

Companions: `LESSONS-LEARNED.md` (pitfalls and content rules),
`TEST-AND-VERIFICATION-LOG.md` (what was checked, what remains),
`REPEATABLE-VALIDATION.md` (how to re-run every check).

---

## Intent

The simplest possible listener: a page telling a Victorian licensed plumber or
roofer whether the rules their work depends on — across both Victorian and
Commonwealth instruments — are **still current**. Each rule shows as verified or
degraded, and behind it a scheduled agent actually opens the source page and
decides whether the claim still holds.

This is a demonstration of three capabilities, not a compliance product. No
design checker, rule engine, accounts, uploads, or AI intake. One page, one
scheduled function, one register file. **The app makes no compliance
determination.**

Scope is plumbing and roofing work in Victoria: water supply, sanitary drainage,
roofing (stormwater), heated water, backflow, gasfitting and mechanical
services, plus the WHS and consumer-law obligations attaching to that work.

---

## The three capabilities

### 1. Platform scheduling, not in-process timers

`functions/verify_register_scheduled.py`, scheduled by `netlify.toml` for
Mondays 07:00 UTC. No `setInterval`/`setTimeout` loop that dies with the
instance. The handler is idempotent and keyed on the Netlify-provided invocation
id — it never trusts a request body. Scheduled functions fire only on
**published** deploys, not previews.

If a cold run with many Cloudflare retries ever approaches the 30 s synchronous
limit, rename the file to `verify_register_scheduled-background.py` for the
15-minute background runtime; the handler signature is identical.

### 2. Source verification, not byte-diffing

Each run opens every source URL and decides whether the recorded assertion still
holds, returning one of three verdicts plus a supporting quote from the page:

| Verdict | Condition | Effect |
|---|---|---|
| `verified` | 2xx and `key_substring` present verbatim in visible text | refresh `verified.on` / `by_agent` |
| `unverified` | 2xx but `key_substring` absent — the source moved | record `changed_from` / `changed_to` + `remedial_note` |
| `unreachable` | non-2xx, Cloudflare challenge, or network error | record `last_successful_check` + `http_error` |

Sources need not be HTML. Primary legislation is published by
legislation.vic.gov.au as `.docx`/`.pdf` and its landing pages carry no
operative text, so the fetcher extracts `.docx` (stdlib only). Where the
verification target is a document a person should not be handed directly, the
optional `human_url` gives the page to read; both URLs must be on official
domains, and the gate always verifies `source_url`.

A claim may assert more than one fact. `key_substring` carries the primary one;
the optional `also_requires` array carries the rest, and **every** listed
substring must be present for the entry to hold. This exists because a claim
could otherwise promise what the gate never checks — see `LESSONS-LEARNED.md`
§3. Where a page does not support part of a claim, the claim is trimmed rather
than a key invented.

**Divergence from the original intent, stated plainly.** The intent called for an
agent that *reasons* over the page. What is built is a deterministic test: is
`key_substring` literally present in the fetched visible text? That is
substantially more than hashing HTML and comparing bytes — it survives cosmetic
edits, navigation changes and re-templating, and it fails precisely when the
load-bearing fact moves. But it is not a language model forming a judgement.

The trade was deliberate. A publish gate must be **decidable and reproducible**:
the same register against the same pages must give the same answer on every run,
or the gate cannot block a deploy. `key_substring` is therefore the linchpin of
the whole system and must be chosen carefully — see `LESSONS-LEARNED.md` §4.

### 3. The verification register, the trust primitive

`register.json` is the single source of truth, mirrored to `public/register.json`
for the static site. Every write uses `fsutil.atomic_write_json`; every
read-modify-write holds `fsutil.file_lock`.

Each entry carries the claim, the asserted `value`, the jurisdictional level
(`VIC` or `Federal`), the `key_substring` the gate tests, the `source_url`, a
`fails_if` decision rule, a `status`, and `verified: { against, on, by_agent,
quote }`. A `ui` block supplies the display fields.

### Entry fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | stable identifier; all merges upsert on this |
| `jurisdiction` | yes | `VIC` or `Federal`; drives the Level filter |
| `claim` | yes | the human sentence — must assert no more than the substrings below verify |
| `value` | yes | the asserted value, shown as the headline figure |
| `key_substring` | yes | primary string the gate asserts is present verbatim |
| `also_requires` | no | further strings, **all** of which must also be present |
| `source_url` | yes | what the gate fetches; HTML or `.docx`, official domain |
| `human_url` | no | what a person should read, when `source_url` is a document |
| `fails_if` | yes | the decision rule for a human reviewing a flip |
| `status` | yes | `verified` / `unverified` / `unreachable`; drives the UI trust state |
| `verified` | yes | `{ against, on, by_agent, quote }` |
| `ui` | yes | display block: `title`, `ref`, `doc`, `obligation`, `tradeTasks`, `tags` |
| `source_moved_to`, `next_edit` | agent | written when a source 301s to a new home |
| `changed_from`, `changed_to`, `remedial_note`, `last_successful_check`, `last_status`, `http_error` | agent | written when an entry degrades |

Register-level: `schema_version`, `register_version`, `generated_on`,
`description`, `allowed_domains`, `entries`, and `last_run`
(`{ run_id, on, by_agent, counts, moved, note }`) written by the scheduled agent.

**A stale `verified` is never kept silently.** When a source moves, the agent
flips the entry and records what changed. The **publish gate**
(`scripts/verify_register.py`) refuses any register in which an entry claims
`verified` without a confirming check in the current run — exit 1, deploy
blocked.

The app honours this: `entryTrust()` in `public/index.html` is the single mapping
from entry to trust presentation and **fails closed** — only an explicit
`status: "verified"` earns the verified line. A degraded entry shows a warning
band and its remedial note, and carries a pill on the card so it is visible while
scanning.

---

## What may enter the register

The governing rule, and the reason the register is worth anything:

> Every value must be a verbatim or directly-quotable fact from a page that was
> actually opened, on an official domain, confirmed by a live fetch.

This applies to clause numbers exactly as it applies to URLs and figures. A
clause reference is shippable **only when a regulator has published it** — not
because clause references are inherently safe. `LESSONS-LEARNED.md` §3 records
what happens when that rule is relaxed, including an upstream clause set whose
numbers were sequentially generated and demonstrably wrong.

Values that exist only inside a paywalled standard are **out** until the register
has an evidence model for human attestation against a licensed copy. The gate has
no such branch today and would hard-fail any such entry.

This spec deliberately does **not** restate the register's contents. Entry counts
and values drift; `register.json` is the authority, and it is human-readable.

Current shape: **60 entries (57 VIC, 3 Federal)** — 30 baseline claims
(Victorian statutory instruments, regulator guidance, WorkSafe duties, the
Domestic Building Contracts Amendment Act 2025 commencement, and three
Commonwealth items) plus 30 `PTR-3500.N-*` clause pointers for the AS/NZS
3500:2025 changes, generated by `scripts/add_standard_pointers.py` from BPC's
published "Summary of key changes" tables.

---

## Acceptance

| Criterion | Status |
|---|---|
| `register.json` populated by real fetches against live URLs | **Met** — all 60 confirmed by `verify_register.py --live` |
| A moved source flips the entry to a degraded status with a recorded reason, and the publish gate blocks it | **Met** — proven by the corruption test in `REPEATABLE-VALIDATION.md` |
| Weekly schedule registered on the platform; handler idempotent and keyed on the run id | **Met in code**; not yet observed firing on a published deploy |
| Page renders each claim as verified with against / on / by + evidence quote, or degraded with what changed | **Met** |
| Claims grouped or tagged by jurisdictional level so a viewer sees which layer of government a rule sits at | **Met** — the results screen carries a "Level" filter bar (Victoria / Federal) beside the "Type" bar. Chips toggle on and off; multiple selections OR within the level axis and AND against type, task and free text. Chips and counts are derived from the data, so a new jurisdiction appears without a code change. |

All acceptance criteria are now met except the scheduled function being observed
firing on a published deploy, tracked in `TEST-AND-VERIFICATION-LOG.md` §3.

---

## Notes

- The register spans two jurisdictional levels deliberately: it proves the
  architecture generalises beyond a single-state, single-regulator watch list,
  which is what matters for cloning to another state or trade.
- Several gov.au sources sit behind Cloudflare and intermittently challenge
  non-browser clients. The verifier reuses a `requests.Session` per host so the
  clearance cookie persists across retries — this is the difference between a
  ~25% and a ~100% pass rate. See `LESSONS-LEARNED.md` §1.
- The live gate cannot run inside a Netlify build (their build servers are
  reliably 403'd by Cloudflare on `bpc.vic.gov.au`). The build runs
  `--offline`; the live gate runs locally and in the scheduled function.
