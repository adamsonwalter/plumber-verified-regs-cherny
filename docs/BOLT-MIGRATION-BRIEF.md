# Brief — migrating this app to a Bolt.new-hosted environment

For the coder taking this on. Read `SPEC.md` first (what the system must prove),
then `LESSONS-LEARNED.md` (what already went wrong). This brief covers only the
migration.

The short version: **the page is easy and the agent is the whole problem.** Do
not let the easy half consume the effort.

---

## 1. What you are inheriting

Everything that ships today is static. `public/` is 8 files, ~191 KB:

| File | Size | Notes |
|---|---|---|
| `index.html` | 72 KB | The entire app. Vanilla JS, inline CSS, **no build step, no framework, no dependencies** |
| `register.json` | 90 KB | 60 entries. The single source of truth |
| `admin/index.html` | 15 KB | Separate dark-theme review page, `noindex` |
| `manifest.webmanifest` + `icons/*` | ~13 KB | PWA install (4 PNGs) |

The app has **zero host coupling** — `grep -c netlify public/index.html` returns
0 — and gets all its data from one relative call:

```js
fetch("register.json?" + Date.now())
```

Behind that sit ~1,960 lines of Python (`requests` is the only dependency):

| File | Lines | Role |
|---|---|---|
| `scripts/verify_register.py` | 484 | **The publish gate.** Shared by the agent — one fetch/verify code path, not two |
| `functions/verify_register_scheduled.py` | 386 | The weekly agent. Re-verifies, writes verdicts, commits back |
| `scripts/fsutil.py` | 158 | Atomic writes + advisory file lock |
| `scripts/add_*.py`, `probe.py`, `make_icons.py` | ~500 | Additive register edits, source inspection, icons |
| `scripts/build_register.py` | 430 | Dead weight — the original seeder. It refuses to run. Do not revive it |

Current host wiring, all of it in `netlify.toml`: `publish = "public"`,
`functions = "functions"`, build command `verify_register.py --offline`,
`PYTHON_VERSION = 3.12`, cron `0 7 * * 1`, and four header rules (JSON
content-type + 60 s revalidate on the register, `nosniff`/`no-referrer` on HTML,
manifest content-type, icon caching).

Agent environment: `GIT_PUBLISH_TOKEN`, `GIT_REPO`, `GIT_BRANCH`,
`REGISTER_PATH_IN_REPO`, plus a platform-provided invocation id used as the
idempotency key.

---

## 2. Part one — the page

This is the straightforward half, but there is one decision to make.

`index.html` is a single dependency-free file. That is maximally portable and
was deliberate. Bolt's usual tree is Vite + React + TypeScript + Tailwind, and
its Database/Publish tooling assumes that shape.

**Recommendation: carry the page over as a static asset first, and only convert
to the host's stack if something concretely requires it.** Rewriting 72 KB of
working, tested vanilla JS into React buys nothing the product needs and risks
every behaviour in §3 — each of which cost a real debugging cycle. Get it
hosted, get the register served, prove the gates, and treat a framework port as
a separate decision with its own justification.

If the host's build genuinely cannot serve a hand-written `index.html`, say so
explicitly and port it — but port it *after* the agent question below is
settled, not before.

---

## 3. What must not regress

Each of these was a real defect, found and fixed. A migration that quietly drops
one is a failed migration. They are all in `public/index.html` unless noted.

- **Trust states fail closed.** `entryTrust()` is the single mapping from entry
  to display. Only an explicit `status: "verified"` earns the verified line; a
  missing or unrecognised status renders as *not re-checked*, never as OK. A
  degraded entry shows a warning band, its `remedial_note`, and a pill on the
  card. Never show an agent-written date for an entry that is not verified.
- **PWA install.** `manifest.webmanifest`, `apple-mobile-web-app-capable`,
  `apple-touch-icon`, and full-bleed icons. This is not decoration: on iOS 16.4+
  it is the only thing that makes an external source link open as a dismissible
  overlay instead of stranding the user. Verify from a Home Screen icon, not a
  browser tab.
- **Never iframe a source.** Every gov.au domain sends
  `X-Frame-Options: SAMEORIGIN`. An in-app viewer renders blank, always. Sources
  open via `target="_blank" rel="noopener"`, preferring `human_url` where set.
- **Contrast.** Tab icons ≥ 4.5:1, search fields with a visible edge. They were
  2.6:1 and 1.12:1 and unusable in daylight.
- **Filters.** Trade task, obligation type, jurisdiction — OR within an axis, AND
  across axes, chips toggle off, counts derived from data.
- **Offline honesty.** Cached data shows the Offline pill and "Using cached
  data"; a rejected cache write reports "Not saved on this device". "Live data"
  and "Offline" are mutually exclusive.
- **No hardcoded counts anywhere.** They have gone stale twice.
- **Register served correctly** — JSON content-type, short cache with
  revalidation, so a republished register is picked up.

---

## 4. Part two — the agent (the actual problem)

**This is where the migration succeeds or fails, and it is deliberately
under-specified below.**

### The intention

Once a week, unattended, something must:

1. Open every `source_url` in the register — 60 today, HTML and one `.docx` —
   from a network path that gov.au will actually serve (see §6).
2. For each entry, assert `key_substring` **and every `also_requires` string**
   are present verbatim in the extracted text.
3. Write exactly one of three verdicts per entry, with evidence:
   - `verified` — refresh the `verified` block
   - `unverified` — reachable but a required substring is gone, i.e. **the rule
     or its wording changed**; record `changed_from` / `changed_to` and a
     `remedial_note`
   - `unreachable` — record `last_successful_check`, `http_error`, remedial note
4. Note a permanent redirect as `source_moved_to` / `next_edit` without failing
   the entry.
5. Write a register-level `last_run` summary (`run_id`, `on`, `counts`,
   `moved`).
6. Never mutate the canonical register mid-run — write a sidecar, then publish
   through a gated step.
7. Publish so the site serves the updated register, with the publish gate
   deciding what ships.

It must be idempotent and keyed on a platform-supplied invocation id, never on
request-body input. It must not be an in-process `setInterval` — that dies with
the instance and has to be a platform scheduler.

### What I am deliberately not specifying

I do not know what Bolt provides for scheduled server-side work, what runtimes
it offers, or how it stores long-lived secrets, and I am not going to guess.
**Those are yours to determine and state back.** Concretely, answer:

- What runs code on a schedule, unattended, without a browser open?
- Is Python available? If not, `verify_register.py` (484 lines) must be ported —
  and the gate and the agent **must keep sharing one implementation**. Two
  copies of the verification logic drifting apart would be the worst possible
  outcome for this system.
- Where do `GIT_PUBLISH_TOKEN`-class secrets live?
- How does the updated register reach the served site? Committing back to GitHub
  is the current mechanism, not a requirement — a database row, an object store,
  or an artefact would all satisfy the intention, provided the gate still runs
  before anything is served.
- Does the scheduled runtime's egress get served by gov.au, or challenged? (§6)

If some part cannot be done on the host, say so plainly and propose where it
runs instead. The agent running elsewhere against the same repo is an acceptable
answer. **Silently dropping the schedule is not** — a register that stops being
re-verified is worse than no register, because the badge keeps claiming
freshness it no longer has.

---

## 5. Validation gates — the acceptance test

The migration is done when all of these pass on the new host. Not before.

**Data integrity**

1. `python3 scripts/verify_register.py --offline` → exit **0** (or the ported
   equivalent). This is the build/publish command.
2. Full live run → exit **0**, all 60 entries confirmed, including the 15
   `also_requires` substrings and the one `.docx` source.
3. Corruption proof, both kinds → exit **1**: falsify a `key_substring`, and
   falsify one `also_requires` entry. The second must name the missing string.
4. Malformed `also_requires` (a string, not a list) → exit **1** on the
   structure gate.
5. Domain gate rejects a non-official host in `source_url` **or** `human_url`.
6. A register with an entry marked `verified` that the run could not confirm is
   **refused**, and nothing ships.

**Agent**

7. A scheduled run fires unattended, with no browser open, and is visible in the
   host's logs.
8. Re-running the same invocation id does not double-apply.
9. Each of the three verdicts is provable against the live internet — point one
   entry at a deliberately wrong expected value and watch it flip to
   `unverified` with evidence.
10. The canonical register is untouched by a run that has not passed the gate.
11. `last_run` appears and the app's Settings → **Last checked** reflects it.

**App**

12. All 60 entries render; every card has a title and a clause/ref line.
13. Fixture test: hand-edit three entries to `verified` / `unverified` /
    `unreachable` and confirm the three display states, including **no**
    "Verified on" line and **no** quote on the `unverified` one.
14. Installs to an iPhone Home Screen; "Open source" from the installed app
    opens a dismissible overlay and returns you to the app.
15. Register republished by the agent is picked up by a returning visitor
    (cache busting works).
16. No console errors; contrast thresholds in §3 hold.

`REPEATABLE-VALIDATION.md` has runnable commands for 1–6 and 9–13; §9 there is
the monitoring runbook for gates 7–11.

---

## 6. Constraints that will bite you

- **The live gate cannot run in the current build.** Netlify's build servers are
  reliably 403'd by Cloudflare on `bpc.vic.gov.au` — different TLS fingerprint
  from an ordinary client. That is why the build command is `--offline` and the
  live gate runs elsewhere. **Re-test this on the new host before assuming it is
  fixed.** If the new build environment is also challenged, keep the same split.
- **Session reuse per host is load-bearing.** One `requests.Session` per hostname
  so the Cloudflare clearance cookie persists across entries. This took the
  pass rate from ~25% to ~100%. Any port must preserve it.
- **Primary legislation is not HTML.** One entry verifies against a `.docx`
  (`legislation.vic.gov.au` landing pages carry no operative text). When
  extracting, join Word runs **within** a paragraph with no separator — joining
  every run with a space yields `"th e remaining"` and breaks matching.
  `human_url` exists so a human is sent to the readable page instead.
- **A claim must never assert more than the gate checks.** That is what
  `also_requires` is for. If you touch claim text, re-read `LESSONS-LEARNED.md`
  §3.
- **`register.json` is stateful, not derived.** It carries verification history
  no script can regenerate. There is no rebuild command, by design.
  `build_register.py` refuses to run for this reason. Change the register
  additively (upsert by `id`) or edit and re-gate.
- Secrets in environment/host secret storage, never in git, never in client
  bundles.

---

## 7. Suggested sequence

1. Answer the §4 questions **first**, in writing, before moving any code. The
   answers determine whether this is a hosting change or a rewrite.
2. Stand the static page up on the new host; prove gates 12–16.
3. Wire the build/publish command to the offline gate; prove gates 1 and 6.
4. Solve the scheduled agent; prove gates 7–11.
5. Only then consider a framework port, with its own justification.

Do not do 5 before 4. A pretty rewrite with no working re-verification is a
worse product than what exists today — the entire proposition is that a badge
saying *verified* means somebody actually looked this week.

---

## 8. `BOLT.md` starter

House process is plans-first: a repo Bolt imports into a new project, does the
first tasks, then stops. Product language only — do not prescribe stack or
database engine.

```markdown
# First tasks (Bolt)

Do these and **stop**. One product. Use your usual stack and Bolt Database.

## Outcome
A licensed Victorian plumber or roofer, on a phone on site, looks up a
regulation and sees whether it was confirmed against the government source this
week — or a clear warning that it was not.

## Screens
- Find a reg — search, plus job shortcuts
- Results — filter by trade task, obligation type, and level (Victoria/Federal)
- Reg detail — the value, where to find it, the supporting quote, the date it
  was last confirmed, and a link out to the source
- Saved — regs the user marked
- Settings — register version, entry count, when it was last checked

## Seed
Load the 60-entry register as supplied. Show it unmodified. Do not invent,
summarise, or "improve" any regulation text — every value is verbatim from a
government page and is checked against it weekly.

## Stop when
A phone-width preview lists the regs, filters by level, opens one, and shows its
quote and last-confirmed date.

Then stop. Continue in git.
```

Note for whoever pastes that: the register is data, not content to be rewritten.
An entry's `claim`, `value`, `key_substring` and `also_requires` are load-bearing
and are verified verbatim against a live government page. Rewording any of them
breaks the gate and, worse, may put a wrong rule in front of a licensed trade.
