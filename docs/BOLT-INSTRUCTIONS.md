# Instructions to paste into Bolt

Everything from here to a subscription product. Paste the whole thing — it is
written to be done in one pass rather than a conversation.

Branch: `bolt-app-v1`. Do not work on `main`; `main` is the live site.

---

## Where things stand

Steps 1, 2, 3 and 5 are done. Accounts, database-backed saves and jobs all
exist; the register renders 60 entries with search, filters and detail views.
**Do not rebuild any of it.**

Two fixes were made afterwards that you must not undo:

- `supabaseClient.js` exports **`authAvailable`** and never throws. It used to
  call `createClient` with undefined config at module load, which threw before
  React mounted and turned missing database config into a blank page for the
  whole product — including the free register, which needs no database at all.
  Every account entry point is now hidden behind that flag. Keep it that way:
  any new account or subscription UI must also be gated on `authAvailable`.
- The four search shortcuts are **job *types*** (`JOB_TYPES`, heading "Start
  with a job type"). "Jobs" now means only the user's own saved collections.
  They previously shared the word on one screen.

**One thing you got wrong last time, so you know the standard:** you reported
"the production bundle compiled successfully" and stopped, but the preview was
blank. `src/main.jsx` ended at `export default App` with no `createRoot`, so
nothing ever mounted. A compiled bundle is not a running app. **From here on, a
step is only done when the preview visibly does the thing**, not when it builds.

---

## The one rule that governs everything

`register.json` is **not** application data and must never go in the database.
It is replaced wholesale every week by an external verification process that
pushes it to GitHub. It is read-only to this app.

Therefore: **anything a user saves stores the entry `id` and nothing else.**
Never copy a regulation's text, value, quote or status into a saved row. When
the register updates, a saved item must re-read the current entry and show its
*current* status. If you snapshot entry content into the database, a user's
saved item will keep showing a rule as verified after the rule has changed —
which is the exact failure this whole product exists to prevent.

Four behaviours must survive every step below:

1. Only `status: "verified"` earns a "Verified on <date>" line. Any other
   status, a missing one, or one you don't recognise shows a warning with the
   entry's `remedial_note` instead — never that date.
2. Source links open in a new tab (`target="_blank" rel="noopener"`), using
   `human_url` when present. **Never** render a source in an iframe: every
   gov.au domain refuses embedding and the frame is always blank.
3. No hard-coded counts. Totals and filter counts come from the data.
4. Readable on a phone in daylight, real tap targets.

---

## Step 1 — Accounts

**Goal:** a plumber can create an account, sign in, sign out, and reset a
forgotten password by email.

Build it with Bolt Database auth. Email and password is enough; no social
logins.

Screens: sign up, sign in, forgotten password (request), set new password
(from the emailed link). Signed-out users can still use the whole register —
**the register stays public and free to browse.** Accounts exist to save things
and, later, to subscribe.

**Verify (all in the preview, signed out to start):**
- Create an account with a real address; confirm you can sign in with it
- Sign out; the register still loads and is fully usable
- Request a password reset; the email arrives; the link sets a new password;
  the new password signs you in and the old one does not
- Reload while signed in — you are still signed in
- Confirm the register still shows 60 entries and the trust rules above are
  untouched

---

## Step 2 — Saved regs move to the database

**Goal:** what a user saves follows them to any device, instead of living in
one browser.

Today saves are in browser storage, so they vanish with the cache and never
reach a second device. Move them into Bolt Database.

- A saved row is `{ user_id, entry_id, created_at }`. **Entry id only** — see
  the rule above.
- A user can read and write only their own saves, and that must be **enforced
  by the database itself, not by the client**. A check that only exists in the
  app is bypassable. Verify by signing in as a second user and confirming you
  cannot see the first user's saves.
- The Saved screen reads the current register and shows current status for each
  saved id. If a saved entry has since gone `unverified`, the Saved screen must
  show that warning.
- If a saved id no longer exists in the register at all, show it as removed
  rather than crashing or silently dropping it.
- **Migrate on first sign-in:** if the browser holds existing saves, move them
  into the account once, then clear the local copy. Nobody should lose their
  saved regs to this change.
- Signed-out users keep using browser storage as now.

**Verify:**
- Save three regs signed in; sign out and back in — still there
- Open the app in a different browser, sign in — the same three are there
- Second account sees none of them
- Temporarily edit a copy of the register so one saved entry reads
  `status: "unverified"` with a `remedial_note`; the Saved screen shows the
  warning, not a verified date
- A browser with existing local saves has them adopted on first sign-in, once,
  with no duplicates

---

## Step 3 — Jobs

**Goal:** a plumber groups saved regs into a named job — "Bennett St reno" —
instead of one flat list.

This is the reason accounts are worth having, so give it room.

- A job has a name, optional note, created date, and a set of entry ids
- Create, rename, delete a job; add and remove regs from it
- A reg can sit in more than one job
- From a reg's detail view, add it to an existing job or a new one
- The job view shows each reg's current status, same rules as everywhere else —
  a job containing a degraded reg must show that plainly, because that is
  exactly when a plumber needs to know
- Same database-enforced ownership as saves — a user reaches only their own jobs

**Verify:**
- Create two jobs, put overlapping regs in both, confirm both read correctly
- Rename a job; delete a job and confirm its regs are not deleted from other
  jobs
- With a degraded entry in a job, the job view flags it without opening it
- Second account cannot see or modify the first account's jobs

---

## Step 4 — Subscriptions

**Goal:** jobs and cross-device saves are a paid feature; browsing the register
stays free.

- Stripe is now **configured** for this project — this step is no longer
  blocked. One paid plan, monthly.
- **Entitlement is checked server-side.** A client-side check is decorative —
  anyone can bypass it. The server decides whether a user may create jobs.
- Free, signed-out: full register, browser-local saves
- Free, signed-in: full register, saves synced across devices
- Paid: jobs
- Handle the states that actually happen: payment fails, subscription is
  cancelled but still in its paid period, subscription lapses. A lapsed user's
  jobs are **retained, not deleted** — they become read-only until they
  resubscribe. Deleting a tradesperson's job records because a card expired
  would be indefensible.
- Show current plan and a way to cancel in Settings

**Verify with Stripe test cards:**
- A free signed-in user cannot create a job, and is told why, clearly
- Subscribe with a test card; jobs become available immediately
- Cancel; jobs stay readable until the period ends, then become read-only
- The data is still there after lapsing — resubscribe and it all comes back
- Confirm the server rejects a job-creation request from an unentitled account
  even if the request is made directly, not through the UI

---

## Step 5 — Ship checks

Before you say you are finished, confirm in the preview:

- The register still shows **60 entries**, count read from the data
- Filters still combine: level (Victoria / Federal), obligation type, trade
  task — OR within an axis, AND across them, chips toggle off
- A detail view shows the supporting quote and a source link that opens in a
  **new tab**; there are **zero iframes** in the app
- Settings shows the register version and when it was last checked, read from
  the data
- The app installs to an iPhone Home Screen and, launched from there, a source
  link opens as a dismissible overlay that returns you to the app
- `npm run build` succeeds **and** the built output still renders when served —
  check both, for the reason at the top of this document

Then stop and report what you did, with the verification results.

---

## Things not to do

- Do not touch `register.json`, `scripts/`, `functions/`, `netlify.toml` or
  anything in `docs/`. The verification pipeline and host wiring are already
  correct and are not yours to change.
- Do not import register data into the database.
- Do not add a "last updated" or "current" badge of your own invention. The only
  freshness signal is each entry's own `status` and the register's `last_run`.
- Do not reword any regulation text. Every `claim`, `value` and `quote` is
  verbatim from a government page and is checked against it weekly.
