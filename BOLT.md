# First tasks (Bolt)

Do these and **stop**. One product. Use your usual stack and Bolt Database.

There is an existing working app at `public/index.html`. **Do not edit it and do
not build on top of it.** Build the new app fresh in your own tree; use the old
one only as a reference for what each screen does.

## Outcome

A licensed Victorian plumber or roofer, on a phone on a job site, looks up a
regulation and sees whether it was confirmed against the government source this
week — or a clear warning that it was not.

## Screens

- **Find a reg** — search box, plus four job shortcuts (Residential Reno, New
  Build, Gas + Hot Water, Stormwater)
- **Results** — the matching regs, filterable by trade task, by obligation type
  (Technical / Licensing / Documentation / WHS / Product), and by level
  (Victoria / Federal). Filters combine
- **Reg detail** — the value, where to find it, the supporting quote from the
  government page, the date it was last confirmed, and a link out to that page
- **Saved** — regs the user marked
- **Settings** — register version, entry count, when the register was last
  checked

## Seed

Use the real data: `register.json` in this repo, 60 entries. Load it as-is.

**Do not invent, summarise, reword or "improve" any regulation text.** Every
`claim`, `value` and `quote` is verbatim from a government page and is
re-checked against it weekly by a separate process. Rewording one breaks that
check and, worse, can put a wrong rule in front of a licensed tradesperson.

Each entry carries a `status`. Today all 60 read `verified`, but the app must
handle all three: `verified`, `unverified` (the source changed), and
`unreachable` (the source could not be opened).

## Rules that are not negotiable

1. **Never present a rule as current unless its own record says so.** Only
   `status: "verified"` earns a "Verified on <date>" line. Anything else — a
   different status, a missing one, one you don't recognise — shows a warning
   instead, with the entry's `remedial_note`, and never that date.
2. **Never show a source page inside the app.** Government sites refuse to be
   embedded; an in-app frame renders blank every time. Source links open in a
   new tab, using `human_url` when the entry has one.
3. **Never hard-code a count.** Entry totals and filter counts come from the
   data.
4. **Readable in daylight on a phone**, held at arm's length in a wet trench.
   Real contrast, real tap targets.

## Stop when

A phone-width preview lists the regs, filters by level, opens one, and shows its
quote and last-confirmed date.

Then stop. Continue in git.
