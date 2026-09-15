# Access tiers, subscription lifecycle, and email — open decisions

Captured 2026-09-11 from a design-review conversation. Nothing in this
document has been built. It exists so the questions raised aren't lost before
there's time to decide and implement them. Every "current state" claim below
is cited against the code as of commit `189669a` on `bolt-app-v1` — re-check
before acting on this if much time has passed.

Companions: `SPEC.md` (what the register itself promises), `LESSONS-LEARNED.md`.

---

## 0. Decision record — 2026-09-15 (supersedes the recommendations in §1 and §2)

Written after Walter's review of the tiers. §1–§4 below are kept as the
original analysis; where this section disagrees with them, this section wins.

### Precondition: the dates have to move

Everything proposed here sells *freshness*. If the weekly re-check does not
reach the live site, alerts never fire and dated records prove nothing.

**Correction to the 2026-09-15 review:** the review said Monday's check did not
run. That was wrong. Per the verification desk's own account, the desk clock
fired on 2026-09-14 at 07:00 UTC, re-checked all 60 entries (60 verified), and
wrote a local scratch register `2026-09-14-agent.3`. It never published: the
push to `main` was rejected as non-fast-forward, and the desk rules correctly
abort rather than force-push. So the live site still serves `2026-09-08-agent.2`
(confirmed against `plumber-cherny.netlify.app/register.json` on 2026-09-15).

The "never run on its own" line in `TEST-AND-VERIFICATION-LOG.md` refers to
**Netlify's** scheduled function, which is a different, unused path. It remains
true of that function and says nothing about the desk.

What moved `main`: two Cursor PRs merged at 00:49–01:17 UTC on 2026-09-14 (add,
then remove, a Grok bridge file). That was ~6 hours *before* the run, which
points to the desk starting from a stale checkout rather than `main` moving
mid-run. Neither commit touched `register.json`.

**Proposed fix, for the desk owner to decide:** fetch at the start of the run,
and if a push is rejected, fetch and rebase once; retry the push only if none of
the incoming commits touch `register.json` / `public/register.json`. Otherwise
keep the current abort. Unrelated commits to `main` should never be able to
silently cancel a week's verification. Also add an alert when a run verifies
but does not publish, since this failure was invisible from the live site.

### The problem with the tiers as built

The register is the value, and all of it is free: lookup, dates, quotes,
source links, and saves. The only paid feature is Jobs, which as built is a
folder. A folder is not worth a monthly fee, and a free account currently
offers almost nothing a device can't, so there is little reason to sign up
either.

Locking the lookup is not the fix. The content is public government pages; a
plumber turned away just bookmarks the BPC page. The free lookup is the shop
window and the proof that the dates are real.

### What people would pay for: being told when something changes

Anyone can check a reg today. What they cannot do is notice that a reg they
relied on three weeks ago has since changed. Only the weekly checker can, and
only if it knows who to tell. That makes a job two things:

- **A watch list** — the regs for one site, with an email if any of them change
  while the job is open.
- **A dated record** — a downloadable snapshot of each reg's status, date,
  quote and source as checked, for the job file. It cannot be rebuilt later from
  the free lookup, and it is what a plumber would want in a dispute with a
  client or an inspector.

### Proposed tiers

| | Gets | Why it exists |
|---|---|---|
| **No login** | Full lookup, dates, quotes, source links. **No saves.** | Shop window and proof. Removing device saves also removes the local/account save split that caused a real bug (see the test log, defect 4). |
| **Free account** | Saved regs on any device, plus a weekly "what changed in the register" email. | Collects an email with marketing consent (needs the §4 checkbox). Gives signing up a reason. |
| **Paid** | Jobs as watch lists with change alerts, plus dated job records to download. | The only tier that tells *you* when *your* regs change, and gives you proof. |

Caveat: at 60 entries, changes will be rare, so alerts will seldom fire. That
argues for widening the register, not against the model.

### Lifecycle on cancellation (replaces §2's recommendation)

Access to the service and a customer's own records are different things.
Keeping jobs readable forever after cancelling gives away the paid tier.

- **Voluntary cancel:** full access to the end of the paid period, then locked.
  Stripe's cancel-at-period-end already provides this.
- **Failed card:** 7 days' grace while Stripe retries, then locked.
- **Before lockout:** one-time "download your jobs" offer. Downloaded dated
  records are the customer's to keep.
- **After lockout:** jobs hidden (not deleted) for 90 days for win-back, then
  hard-deleted. The user drops back to a free account.
- The existing migrations' "readable forever" intent must be replaced, not
  timer-patched (§2 already notes this).

### Account vs subscription — what exists

- **Separate, and working:** the Supabase account (`auth.users`) and billing
  (`stripe_customers`, `stripe_subscriptions`) are different records. The
  webhook re-syncs the full subscription from Stripe on any event carrying a
  customer, so cancellations reach the database (assuming the Stripe endpoint
  is subscribed to subscription events — not verified here). Cancelling billing
  does not touch the account.
- **Missing entirely:** there is no "close my account" path. `saves` and `jobs`
  cascade on user deletion, but `stripe_customers.user_id` references
  `auth.users` with no `ON DELETE` rule, so deleting a user who ever checked out
  will likely be refused by the database. Deleting an account also does not
  cancel the Stripe subscription. Needs a flow that cancels billing first, then
  deletes the user.

### Build status (2026-09-15)

| Item | State |
|---|---|
| Weekly publish fix | Done by the verification desk; live register is `2026-09-15-agent.3`. Confirm next Monday's run publishes. |
| No saves without an account | Built and verified on the dev server (`e8846e6`). |
| Dated job record | Built and verified in Chrome against a real job (`c523e54`). Records the register as at printing, not per-job snapshots. |
| Lock jobs after lapse, grace on failed card | Applied by Bolt 2026-09-15. Verified against the live database as the subscribed test account: `has_jobs_access()` returns `true`, jobs are readable, and an anonymous caller is refused (42501). The locked state is still untested (needs a cancelled subscription). Grace length is a Stripe setting (see below). |
| Delete 90 days after lockout | Applied by Bolt 2026-09-15. **Whether it is scheduled is unknown** — Bolt did not say if pg_cron was installed. Ask Bolt to run `select jobname, schedule from cron.job where jobname = 'purge-lapsed-jobs';` |
| Change alerts and weekly digest email | On hold — Walter believes Bolt has email built in; check before choosing a provider. |
| Close my account | Built, migration applied and function deployed by Bolt 2026-09-15. Verified live without deleting anything: with the user's token and no confirmation the function returns 400 "Confirmation required" (the guard in this repo's source, so the deployed code is current), and with no token it returns 401. A real close is still untested — use a throwaway account. |

**Close account, as built:** Settings → Close account → confirm. The function
cancels every live Stripe subscription immediately (no refund for the rest of
the period — say so if that should change), and if Stripe refuses it stops
without deleting anything. It then deletes the user, which cascades to saves,
jobs, job items and the billing link. The Stripe customer and its invoices are
kept. Test on a throwaway account: subscribe, close, then confirm in Stripe the
subscription is cancelled and that the email can sign up again from scratch.

**Stripe setting this depends on:** Billing → Revenue recovery → Retries.
Finish retries within about 7 days, and when they fail, **cancel the
subscription**. The database treats `past_due` as the grace period, so if
Stripe is left to keep a subscription past due for weeks, the grace lasts
weeks.

**Still to test** (migrations are applied) (all states forced from the
Stripe dashboard on a test customer):
1. Active: jobs visible and editable (unchanged).
2. Cancel at period end: jobs still editable, and a banner gives the end date
   and says to download records.
3. Cancel immediately: jobs list is empty, "Your jobs are locked" gives the
   delete date; the API refuses a direct read of `jobs` (not only writes).
4. Resubscribe: the same jobs come back.
5. Past due (use a card that fails on renewal): jobs keep working and the
   "Update card" banner shows.

**On Bolt's security-advisor note** that `has_jobs_access()` is callable by
signed-in users: that is required, not a leak. Row-level policies run as the
calling role, so `authenticated` must be able to execute a function the policies
call; revoking it would make every Jobs query fail with permission denied. It
only ever answers for the caller (`auth.uid()`), and anonymous callers are
refused. Leave it.

### Decisions, in order

1. Make the weekly publish reliable (fix above), then confirm the live dates
   move on the next Monday run.
2. Adopt the three tiers above, or say which part to change.
3. Confirm 7-day failed-card grace and 90-day retention.
4. Build "close my account", cancelling billing at the same time.

## 1. What is actually free today

There is no paywall on the register itself. As built:

- **Browse, search, filter, open any entry, see the verification date and
  quote, click through to the government source** — available to every
  visitor, signed in or not. Nothing gates this (`src/main.jsx` `FindScreen`
  / `ResultsScreen` / `DetailModal` take no subscription prop).
- **Save a regulation** — free for everyone. Signed out, it's written to
  `localStorage`; signed in, it syncs to Supabase (`toggleSaved`,
  `src/main.jsx:218`). No subscription check anywhere in this path.
- **Jobs** (grouping saved regs by project/site) is the only paid feature —
  gated by `subscription.isActive` (`src/jobs.jsx:121`).

So today's model is: the entire stated value proposition of the app — "know
whether the rule you're relying on is still current, with a source to prove
it" — is free forever. The subscription buys a project-organisation feature
layered on top.

### The tension

The core value (verified, dated regs) costs nothing. That's good for a
try-before-you-buy motion and matches "the content is public-domain
government material — what we sell is the labour of checking it, not the
facts themselves." It's bad if the intent was for Jobs to be a nice-to-have
upsell on top of a metered core product — right now Jobs is the *entire*
product being sold, and everything a plumber would actually open the app for
day-to-day is already free.

**This needs a decision, not a guess.** Two shapes to choose between:

- **A — Keep it as is, sell organisation/workflow.** Free tier = full read
  access to the register, forever, no cap. Paid tier = Jobs (grouping,
  multi-site organisation) plus, later, things like multi-device sync of
  Jobs specifically or team seats. Honest about what's actually being sold;
  doesn't risk looking crippled when a friendly user demos it to a colleague.
- **B — Meter something in the core register to create paywall pressure.**
  e.g. free tier sees verification status but not the supporting quote / not
  the direct source link beyond N per week, or search is capped. Creates a
  harder subscribe trigger, but works against the exact trust story that's
  meant to be the differentiator (a plumber who is told "sign up to actually
  see if this is real" learns the free tier is a teaser, not a verified
  register) — and it complicates the has-nothing-to-hide argument in the
  marketing plan already written up (see the FAQ answer in Settings).

No recommendation is forced here since this is a pricing/positioning call,
but option A is the one consistent with everything already shipped (the FAQ
literally says "you can always read the primary source yourself"). If B is
wanted, it needs to be decided before more UI is built around the free path,
since metering it later is a downgrade users will notice and resent.

---

## 2. What happens when a subscription lapses

Current behaviour, deliberately built this way in migration
`20260908080447_enforce_active_subscription_on_job_mutations.sql.sql`:

- Jobs and job items remain **readable forever** once created — the SELECT
  RLS policy is owner-scoped with no time bound.
- Only *mutation* (create/edit/delete a job, add/remove/edit a job item) is
  blocked once `has_active_subscription()` returns false.
- The UI reflects this honestly: `src/jobs.jsx:136` shows "Your subscription
  is not active. Existing jobs are still available to view." — not a dark
  pattern, just permanently generous.

The concern raised: this means someone can subscribe for one billing period,
build out every job they need, cancel, and keep permanent free read access
to the thing the subscription was supposed to gate. That is a real gap, not
a misreading — the policy has no expiry mechanism at all today, only an
edit/create lock.

### Options for a lifecycle

| | Grace period | Then | Retention |
|---|---|---|---|
| **Current** | none | mutation blocked immediately, reading never blocked | forever |
| **Standard SaaS pattern** (what "everyone else" does) | ~7–14 days full access after lapse, to absorb card-decline/renewal-hiccup false positives | jobs become inaccessible (hidden, not deleted) unless resubscribed | data kept for some retention window (commonly 30–90 days) in case of resubscribe/win-back, then hard-deleted |
| **Harsher / immediate lock** | none | reading blocked the moment `status` leaves `active`/`trialing` | same retention question applies |

**Recommendation:** the middle row. A short grace period (10 days matches
what was mentioned) protects against the everyday case of a card just having
expired — punishing that as hard as deliberate cancellation creates support
tickets for no reason. After the grace period, lock reads (not just writes)
behind `has_active_subscription()`, and pick a hard-delete retention window
(30–90 days is typical) so the data isn't lived with in RLS-locked limbo
forever, and so a genuine win-back inside that window can just work by
resubscribing rather than starting over.

This also means the "read forever" comment inside the existing migration
becomes wrong and should be revisited alongside whatever migration
implements the grace period — don't just bolt a timer on top without
updating that stated intent.

### What implementing this actually requires

- A `grace_period_ends_at` (or equivalent) timestamp, set when
  `syncCustomerFromStripe` (`supabase/functions/stripe-webhook/index.ts:125`)
  observes a status transition out of `active`/`trialing`.
- `has_active_subscription()` extended to treat "within grace period" as
  still allowed for reads (not writes — writes should probably lock
  immediately on lapse, reads stay open through the grace window).
- A scheduled job (same pattern as the weekly register verification agent
  already described in `SPEC.md`) to sweep past-grace-period accounts and
  either soft-lock or hard-delete on schedule — this is not something a
  webhook alone can do, since "10 days later" isn't an event Stripe fires.

None of this is built. It's a reasonably small, well-understood change once
the grace-period length and retention window are actually decided.

---

## 3. Email — nothing exists today

Confirmed by reading the whole webhook and checkout functions: **no email is
sent anywhere in this system.** Not on signup, not on payment, not on
cancellation, not on lock-out. Supabase Auth's own default emails (signup
confirmation, password reset) are the only mail that currently leaves the
system, and those are Supabase's stock templates, unbranded.

### Events that need a message, at minimum

1. **Welcome** — on first successful signup.
2. **Payment confirmed** — on `checkout.session.completed` /
   subscription becoming active.
3. **Lapse warning** — the moment the grace period (§2) starts: "your
   subscription ended, you have N days before your jobs become
   inaccessible."
4. **Final warning** — a day or two before the grace period ends.
5. **Locked notice** — when access is actually removed.
6. *(Later, not urgent)* — win-back email if there's a retention window
   before hard delete.

### Where to send these from — needs research before building anything

Three real options, in the order worth checking:

- **Stripe's own customer emails.** Stripe Billing can be configured (no
  code) to send failed-payment and upcoming-renewal emails directly from the
  Stripe dashboard. This may already cover #3/#4 in substance without
  writing anything. Check the Stripe dashboard's "Customer emails" settings
  before building a custom path.
- **Supabase Auth email customisation.** The welcome email (#1) may just be
  a matter of customising Supabase's existing signup-confirmation template
  rather than standing up new infrastructure.
- **A transactional email provider triggered from the existing webhook.**
  `supabase/functions/stripe-webhook/index.ts` already receives every
  Stripe lifecycle event server-side — it's the natural place to call an
  email API (Resend, Postmark, etc.) for anything Stripe's own emails don't
  cover, particularly #5 and #6 which are specific to this app's grace-period
  logic rather than generic billing events.
- **A Bolt-hosted email agent** — mentioned as something to check. Not
  evaluated here since it depends on what Bolt currently exposes for
  transactional email; per [[Bolt migration pipeline]] and the standing
  `bolt.host`-publish-is-manual constraint already on file
  (`~/.agents/skills/bolt-new-portable-builder/references/how-bolt-thinks.md`),
  confirm whether any Bolt-side automation actually fires without a human
  clicking Publish before relying on it for anything time-sensitive like a
  grace-period countdown.

**Action for later:** check Stripe's built-in email settings first — it may
shrink this whole section to "customise two dashboard toggles plus a welcome
email," rather than requiring new infrastructure.

---

## 4. Marketing consent and Privacy Policy

**Update 2026-09-12:** item 1 below is done — a short notice lives at
`public/privacy.html` (Digital Investor Pty Ltd, ABN 86 006 254 566,
privacy@digitalinvestor.com.au), linked from signup and Settings.
Deliberately kept to three sentences: on review, a full APP-style policy
document was judged disproportionate for a business at this scale and this
list's own §1 finding that it likely qualifies for the small-business
exemption — this is a voluntary, proportionate notice, not a claim of full
Privacy Act coverage. Item 2 (consent checkbox) is still not built.

Confirmed at the time this was written: **there was no Privacy Policy, Terms
of Service, or consent checkbox anywhere in this codebase** — not a page,
not a link, not a checkbox on the signup form (`AuthModal`,
`src/main.jsx:357`).

This matters now, specifically, because the intent to use collected emails
for marketing (this app, and others) turns it from "nice to have" into a
compliance requirement:

- Under Australia's **Spam Act 2003**, sending a marketing email requires
  the recipient's consent, obtained at or before collection, plus a working
  unsubscribe in every message. Transactional emails (§3 above — welcome,
  payment, lockout) do **not** need this consent; anything promotional
  (including "check out my other app") does.
- Under the **Privacy Act 1988** (and the ADM-transparency changes already
  tracked elsewhere in this environment's project set), collecting an email
  address at signup and later using it for a *different* purpose than the
  one it was collected for (account access) needs to be disclosed at
  collection time — i.e. in a Privacy Policy that exists before the
  marketing use starts, not after.

**What this requires, at minimum, before any cross-app marketing email is
sent:**

1. A Privacy Policy page (even a short one) stating what's collected, why,
   and that it may be used to tell the user about other apps/features —
   published and linked before it's relied on.
2. A consent checkbox on signup (`AuthModal`, `src/main.jsx:357`), unchecked
   by default, separate from the "create account" action itself — account
   creation must not be conditional on accepting marketing email.
3. An unsubscribe path in every marketing message (not required for the
   transactional emails in §3).

None of this blocks V1 as it stands today, since no marketing email is being
sent yet — but it blocks turning that on, and the policy page takes longer
to get right than the checkbox does, so it's worth starting whenever there's
a spare hour, ahead of actually needing it.

---

## Summary of what needs a decision (not code) first

1. Pricing shape: keep the full register free forever (A) or meter something
   in it (B)? — §1
2. Grace-period length and hard-delete retention window for lapsed Jobs —
   §2
3. Whether Stripe's built-in customer emails already cover the lapse/renewal
   warnings before building anything custom — §3
4. Who's writing the Privacy Policy content (not a coding task) — §4
