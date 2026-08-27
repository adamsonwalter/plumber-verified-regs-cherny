# Content decisions & next steps — what ships, what doesn't, and why

Decisions about what is allowed into `register.json`, the evidence each kind of
claim requires, and the work still outstanding. Written so the reasoning
survives without the conversation that produced it — particularly the reasons
some content is permanently excluded, which are easy to lose and expensive to
rediscover.

Companion to `LESSONS-LEARNED.md` (build/debug findings) and
`TEST-AND-VERIFICATION-LOG.md` (what was checked).

---

## The rule

An entry ships only if `verify_register.py` can confirm its `key_substring`
verbatim in text fetched live from an official domain. No exceptions, because
the app's entire proposition is the "Verified" badge. Anything that cannot meet
that bar either stays out or needs a new, explicitly designed evidence model —
not a relaxation of this one.

## Pointers vs values

These are different claims with different risk profiles, and the split is what
lets useful content ship while the paywalled material waits.

| | Ships free? | Why |
|---|---|---|
| **Pointer** — "isolation valve location is at AS/NZS 3500.1:2025 Clause 5.4.2" | Yes | BPC publishes the clause number on a free page, so it verifies verbatim. Clause numbers are facts, not copyrightable. |
| **Value** — "…and the limit is 500 kPa" | No | Lives only inside the paywalled standard. Needs a licensed copy and a human attestation. |

The line sits further back than "clause references are free": a clause reference
is shippable **only when a regulator has published it**. A clause number from any
other origin has no evidence behind it (see the exclusion below).

30 pointers currently ship, ids `PTR-3500.N-<clause>`, added by
`scripts/add_standard_pointers.py` from BPC's "Summary of key changes" tables for
AS/NZS 3500 parts 1–4. Those are the 2025-edition changes, which is the material
that matters now that work commenced on or after 20 Oct 2025 must comply with the
2025 edition. Each entry stores BPC's own wording as its quote, so it carries real
substance rather than only a signpost.

---

## Permanently excluded: the 34 `ws-1xx` / `san-1xx` records

The sibling `trade-regulations-okf` repo carries 34 install-spec clause records
(pipe sizing, trap seal depths, test pressures). **Do not import them.** They are
not merely unverified — their clause numbers are demonstrably wrong.

Evidence:

1. **All 34 cite the same URL** — one BPC landing page — and that page contains
   none of their values. It establishes only which edition is current, which the
   register already covers via `RS-STANDARD`, `WATER-STD`, `SAN-STD`, `HEAT-STD`.
2. **The clause numbers are sequentially generated.** They run in perfect
   ascending order — sections 3, 4, 5 … 17, exactly one topic per section — with
   "as-installed drawings" dropped to section 2 in *both* the `ws-` and `san-`
   series independently. Real standards are not organised one topic per section
   in ascending topic order.
3. **Two direct contradictions against BPC's own words:**
   - `ws-103` places hot/cold water separation at cl 5.4. BPC states verbatim
     that Clause 5.4.2 is *"Isolation valves must be installed immediately before
     each flexible hose assembly…"*.
   - `ws-106` places isolation valves at cl 8.1 — the same requirement, a
     different invented number.
4. The source repo self-rates all 34 at `confidence: 0.7`, and their
   `confidence_sources` attest only to *which edition applies*, never to clause
   content.

Importing them would send a licensed plumber to the wrong clause under a
"Verified" badge. If those topics are wanted, source the clause numbers the way
the BPC ones were sourced: from a published regulator page, or from a licensed
copy under an attestation model that does not yet exist.

---

## Next steps

### 1. Numeric values need an evidence model before they need a licence

`verify_register.py` can only confirm a `key_substring` against fetched page
text. An attested value — a human vouching against a licensed copy — has no
branch in the gate, and the publish gate would hard-fail any entry claiming
`verified` without a live confirmation. **Design that model before collecting
values, not after.**

The trust vocabulary in `public/index.html` (`entryTrust()`, tiers `ok` /
`stale` / `unknown`) is the natural carrier — an attested tier would sit
alongside them — but "what counts as evidence, and what must the gate check
instead of a live fetch" is the real decision.

Licensing note: purchasing a standard does not grant redistribution rights;
Standards Australia runs a separate program for that. Facts and figures are not
copyrightable, but clause *prose* is — so stating a numeric requirement beside a
clause pointer is a different question from reproducing clause text, and that
distinction likely determines which program is actually needed.

### 2. `scripts/build_register.py` is stale and destructive

It has not been modified since `fed661c`, while `2bb361d` added the `ui` blocks
directly to `register.json`. Its `add()` writes no `ui` key, and it overwrites
both `register.json` and `public/register.json`. Running it — **as `README.md`
currently instructs** — would strip the `ui` block from all 59 entries and break
every card and detail sheet, since `renderRegCard()`, `openSheet()`,
`whereToFind()`, `matchesQuery()`, `matchesTasks()`, `matchesObligations()` and
`paintClassic()` all read `e.ui.*`. It is also unaware of the 30 pointer entries.

Either teach it the `ui` blocks and the pointers so it genuinely reproduces the
59-entry register, or make it refuse without an explicit flag and fix the README.
`scripts/add_standard_pointers.py` upserts by id rather than regenerating,
specifically to avoid this.

### 3. Smaller items

- When offline, the settings screen shows Register version and Entries as "—",
  because `paintSettings()` fills them only when `REG` is set — though `cache.v`
  holds the version. Showing the cached version would beat a dash.
- Pointer entries label their clause reference "Verified value". Accurate but
  slightly odd; a pointer-specific label may read better if more pointer content
  lands.

---

## Already resolved

- **The app now honours `status`** (`4f479d5`). `entryTrust()` is the single
  mapping from entry to trust presentation and fails closed: only an explicit
  `status: "verified"` earns the verified line. Previously the app rendered
  "Verified on …" unconditionally, so an entry the weekly agent had degraded kept
  its badge — and on the `unverified` path the agent overwrites `verified.on`
  with the run date and the quote with a snippet of the *changed* page, making a
  stale entry look freshly confirmed.
- **Boot crash and offline indicator** (`56cc0a1`). `computeChanges()` threw on
  an absent cache, which blanked the home screen with a raw TypeError even when
  the fetch had succeeded. The offline pill had never worked — no element carried
  `id="offline"` — so the app claimed "Up to date" while serving cached data.
