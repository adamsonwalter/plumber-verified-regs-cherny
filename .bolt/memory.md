# Project memory

## Product intent & audience

- App connects Bolt and Stripe; Bolt hosts the built-in database, Stripe handles payments between user and Stripe.
- App appears to be job-related; includes user management, persistent data ("users and saved jobs").
- Deployed on Netlify.

## Brand personality & voice

- Not yet established.

## Visual design & UX direction

- Framework: Vite + React.
- No visual/UX direction inferred yet.

## Decisions, constraints & rationale

- Database is Bolt's built-in database (runs on Supabase systems but included in Bolt plan; no separate Supabase account or billing).
- Stripe is the only separate billing relationship.
- Two database identifiers previously surfaced:
  - `bolt-native-database-69306323` — likely Bolt's built-in database for this project.
  - `pbgrxeacopyjmokovjqe.supabase.co` — a Supabase project URL referenced by user.
- Stored connection URL in the project does not match user-supplied URL; mismatch unresolved.
- No code changes made; guidance was advisory only.

## Open questions & assumptions

- Which Bolt database the live app is connected to remains unresolved; user must verify in Bolt database settings.
- URL mismatch may indicate old/copied database; live data (users, saved jobs) may not match expectations.
- Need to confirm live Netlify site and Bolt preview read the same database.
- Unknown Bolt plan tier (Pro/Teams vs standard), affects future database migration options.
- No `.bolt/prompt` present; no global user instructions to reference.