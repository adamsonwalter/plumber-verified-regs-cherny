# Project memory

## Product intent & audience

- App with user accounts, payments/subscriptions, jobs, and saved items — likely a job board or marketplace with a premium subscription tier.
- Audience: end users who browse/save jobs and manage paid subscriptions.

## Brand personality & voice

- Not yet inferred.

## Visual design & UX direction

- Known screens: jobs, saves, subscription.
- No design details inferred yet.

## Decisions, constraints & rationale

- Backend: Supabase (database, auth, RLS/account rules, functions).
- Supabase backend contains tables, account-related RLS rules, and four payment/account functions — all intact after the breakage.
- Frontend code (`src/`) and `supabase/` folder were lost; build settings also missing.
- Bolt requires Pro or Teams plan to connect Supabase; connecting a different database would replace the current connection.
- Recovery approach: use Bolt Version History to restore the last pre-breakage version rather than rebuilding from memory, to avoid overwriting user work.

## Open questions & assumptions

- Version History recovery not yet confirmed by user.
- Post-recovery validation needed: app builds, and jobs/saves/subscription screens still align with database schema and functions.
- No backup of frontend code outside Bolt is known to exist.