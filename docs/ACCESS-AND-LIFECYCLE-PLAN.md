# Access tiers, subscription lifecycle, and email — open decisions

Captured 2026-09-11 from a design-review conversation. Nothing in this
document has been built. It exists so the questions raised aren't lost before
there's time to decide and implement them. Every "current state" claim below
is cited against the code as of commit `189669a` on `bolt-app-v1` — re-check
before acting on this if much time has passed.

Companions: `SPEC.md` (what the register itself promises), `LESSONS-LEARNED.md`.

---

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
