# Repeatable validation — how to re-run every check

Every validation step in `TEST-AND-VERIFICATION-LOG.md` is scripted and
reproducible. This file is the runbook: the exact commands, in order, with what
each should print. If any step diverges from the "expected" output, stop and
investigate before trusting the register.

No special tooling is required beyond Python 3.11+ with `requests`
(`pip install -r requirements.txt`) and Node 18+ (only for the agent decision-
table test).

---

## 0. One-time setup

```bash
cd /path/to/plumber-verified-regs-cherny
python3 -m venv .venv && source .venv/bin/activate   # optional but tidy
pip install -r requirements.txt                        # installs requests
node --version                                         # need >= 18 for global fetch
```

---

## 1. Structure + domain gate (offline, fast, no network)

Asserts every entry carries `source_url`, `jurisdiction`, `fails_if`,
`key_substring`; that no entry is simultaneously verified AND
unverified/unreachable; that every source host is on the official allow-list.

```bash
python3 scripts/verify_register.py --offline
```

**Expected:** exit 0, last line
`STRUCTURE/DOMAIN/CONSISTENCY PASSED (run with --live to enforce freshness).`

---

## 2. Full live publish gate (the one that matters)

Re-opens all 60 sources, extracts visible text (HTML or `.docx`), asserts every
required substring is literally present — `key_substring` plus each
`also_requires` entry — enforces the domain allow-list, and refuses to publish
any `verified` entry the current run can't confirm.

```bash
python3 scripts/verify_register.py --live
```

**Expected:** exit 0, one `(1b) also_requires: N additional substring(s) will be
enforced` line, `60` lines of `<id>: kind=ok status=200 needle_present=True`,
and the closing line `PUBLISH GATE PASSED: register is consistent and every
verified entry is backed by a current successful check.`

If exit ≠ 0: the printed `hard failure(s)` name the offending entry. A
`kind=cloudflare` / `needle_present=False` on a *known-good* BPC entry is
almost always transient (see §5); re-run once before treating it as real. A
`needle_present=False` on a non-BPC source is a genuine content change — open
the URL and update `register.json`.

---

## 3. Corruption proof — gate must block a bad register

Deliberately falsify one entry's `key_substring` and confirm the gate exits 1.
This proves the flip-to-unverified / publish-block path actually fires (the
thing that stops a silently-stale claim shipping).

```bash
python3 - <<'PY'
import json
d = json.load(open("register.json"))
for e in d["entries"]:
    if e["id"] == "BOXGUTTER-CARVEOUT":
        e["key_substring"] = "H9Z9-corrupt-does-not-exist"
        e["value"] = "H9Z9 (corrupted)"
json.dump(d, open("/tmp/reg_corrupt.json", "w"), indent=2, ensure_ascii=False)
print("corrupted BOXGUTTER-CARVEOUT key_substring")
PY

python3 scripts/verify_register.py --live --register /tmp/reg_corrupt.json
echo "exit=$?   # MUST be 1"
```

**Expected:** exit 1, with
`PUBLISH GATE: BOXGUTTER-CARVEOUT verified but NOT confirmed live -> BLOCK`.

You can re-point the corruption at any entry id — `WATER-STD`,
`CERT-THRESHOLD`, etc. — to prove it isn't entry-specific.

---

## 4. Scheduled-agent decision table (the three verdicts)

Proves the agent's reasoning produces exactly three verdicts against the real
internet: `verified` (reachable + needle present), `unverified` (reachable but
needle absent — the auto-flip), `unreachable` (non-2xx / error). The scheduled
agent is Python (`functions/verify_register_scheduled.py`), so the test is a
small Python harness that imports the **shared** `verify_register.fetch` — the
exact same fetch+reason code path the gate and the agent both use:

```bash
python3 - <<'PY'
import sys; sys.path.insert(0, "scripts")
import verify_register as vr
cases = [
  ("reachable+present -> verified",
   "https://ncc.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/7-roof-and-wall-cladding/part-74-gutters-and-downpipes",
   "Part 7.4", "verified"),
  ("reachable+absent -> unverified(flip)",
   "https://ncc.abcb.gov.au/editions/ncc-2022/adopted/housing-provisions/7-roof-and-wall-cladding/part-74-gutters-and-downpipes",
   "Clause ZZZ-corrupt-999", "unverified"),
  ("404 -> unreachable",
   "https://www.legislation.vic.gov.au/in-force/statutory-rules/no-such-instrument-9999/xxx",
   "x", "unreachable"),
]
p=f=0
for name, url, needle, expect in cases:
    kind, status, text = vr.fetch(url)
    present = bool(text) and needle.lower() in text.lower()
    got = "verified" if (kind=="ok" and present) else ("unverified" if kind=="ok" else "unreachable")
    ok = got == expect
    print(("PASS " if ok else "FAIL ")+name+f"  kind={kind} present={present} -> {got}")
    p += ok; f += (not ok)
print(f"\n{p} passed, {f} failed")
PY
```

**Expected:** `3 passed, 0 failed`.

---

## 5. Scheduled-agent end-to-end (local, isolated)

Runs the full agent against a **copy** of the register so the canonical file
is never mutated. Confirms it writes a versioned sidecar and produces a
summary.

```bash
rm -rf /tmp/agenttest && mkdir -p /tmp/agenttest
cp register.json /tmp/agenttest/register.json
( cd /tmp/agenttest && python3 /path/to/plumber-verified-regs-cherny/functions/verify_register_scheduled.py ) \
  | python3 -c 'import sys,json; b=json.load(sys.stdin); print("ok:",b["ok"],"| summary:",b["summary"]); print("written:",b["written"])'
```

**Expected:** `ok: True`, `summary: {'verified': 29, 'unverified': 0, 'unreachable': 0}`
(or a small handful of `unreachable` on an unlucky Cloudflare run — those
should self-heal on the next run), and `written` pointing at a
`register.proposed.<runid>.json` sidecar.

Then confirm the canonical register is untouched:

```bash
python3 -c 'import json; d=json.load(open("register.json")); print(d["register_version"])'
# must still print whatever version is committed (currently 2026-08-28-act),
# NOT a fresh "<date>-agent" value — the agent writes a sidecar, never the
# canonical file, when run locally.
```

---

## 6. Build command (what Netlify runs)

The exact command from `netlify.toml`'s `[build] command`:

```bash
python3 scripts/verify_register.py --live || (echo 'PUBLISH GATE FAILED — see scripts/verify_register.py'; exit 1)
echo "build exit=$?"   # MUST be 0
```

---

## 7. Inspecting any single source by hand

```bash
# status + headers + first 1500 chars of visible text:
python3 scripts/probe.py <source-url>

# status + whether a specific needle is present (with surrounding context):
python3 scripts/probe.py <source-url> "<needle>"

# batch reachability of many URLs:
python3 scripts/probe.py --batch urls.txt
```

---

## 8. Changing the register (there is no rebuild)

`register.json` is **stateful, not derived**: the weekly agent writes `status`,
`verified`, `remedial_note`, `last_successful_check` and friends into it and
commits it back, so no script can regenerate it. `scripts/build_register.py` is
the original one-time seeder and refuses to overwrite an existing register — see
`LESSONS-LEARNED.md` §8.

- **Correct one value** → edit `register.json`, re-run §1 + §2.
- **Add entries** → write an additive upsert keyed on `id`, following
  `scripts/add_standard_pointers.py` (bulk, live-fetched) or
  `scripts/add_dbca_commencement.py` (single claim, refuses to add if the
  substring is absent). Then re-run §1 + §2.
- **Never** run `build_register.py` to "refresh" anything.

---

## 9. Monitoring the weekly scheduled run

The agent runs Mondays 07:00 UTC on Netlify's scheduler, and **only on published
deploys** — it does not fire on previews. What to check after a run:

**a) Did it run?** Netlify → Functions → `verify_register_scheduled` logs. The
handler prints a JSON summary ending in `finished_at`. It is idempotent and
keyed on the Netlify invocation id.

**b) What did it conclude?** Look at `last_run` at the top of `register.json`:

```bash
python3 -c "import json;print(json.dumps(json.load(open('register.json'))['last_run'],indent=2))"
```

`counts` should read `{verified: 60, unverified: 0, unreachable: 0}`. The app
shows the same thing in Settings → **Last checked**.

**Before the first scheduled run this prints `null`, and Settings shows "—".**
That is correct, not a fault: `last_run` is written only by the agent, and the
committed register was assembled by the additive scripts. The first Monday run
is what populates it — its appearance is itself the signal that the schedule
fired.

**c) Did anything degrade?** Any entry not `verified` is the point of the whole
system — it means a source moved, or a rule changed.

```bash
python3 -c "
import json
for e in json.load(open('register.json'))['entries']:
    if e.get('status') != 'verified':
        print(e['id'], '|', e['status'], '|', e.get('remedial_note','')[:120])
    if e.get('source_moved_to'):
        print(e['id'], '| MOVED ->', e['source_moved_to'])
"
```

Interpreting it:

| Verdict | Means | Do |
|---|---|---|
| `unreachable` | source did not open — usually a Cloudflare challenge or a site outage | Nothing on the first occurrence; it normally clears next run. If it persists, re-point at another authoritative page. |
| `unverified` | page opened but a required substring is gone — **the rule or its wording changed** | Open the source, establish the new position, update `value` / `key_substring` / `also_requires` / `claim`, re-run §2. |
| `source_moved_to` set | source 301'd to a new home; the entry still verifies | Update `source_url` to the new URL so the register does not depend on a redirect. |

A degraded entry is safe to leave briefly: the app fails closed, showing a
warning band and the remedial note instead of a verified badge, and flagging the
card in the list. What it must never do is sit there unread — `unverified` means
a plumber's rule may have moved.

**d) Did the site republish?** If `GIT_PUBLISH_TOKEN` + `GIT_REPO` are set the
agent commits the updated register back, which triggers a deploy whose build
runs §1 as its command. Without a token it writes a `register.proposed.*.json`
sidecar for manual review instead, and nothing ships until you merge it.
