# Project memory

## Product intent & audience

- App includes user management and persistent data (inferred from database usage and references to "users and data").
- Audience and core product purpose not yet specified.

## Brand personality & voice

- Not yet established.

## Visual design & UX direction

- Framework: Vite + React.
- No visual/UX direction inferred yet.

## Decisions, constraints & rationale

- Project uses a Supabase-compatible database connection; details are stored in the project.
- Two database identifiers surfaced this turn:
  - `bolt-native-database-69306323` — naming suggests Bolt's built-in database (included in Bolt plan, no separate Supabase billing).
  - `pbgrxeacopyjmokovjqe.supabase.co` — a Supabase project URL the user referenced.
- The stored connection URL in the project does not match the user-supplied URL, indicating possible project copy/divergence or changed credentials.
- No changes were made this turn; guidance was advisory only.

## Open questions & assumptions

- Which database the project should target remains unresolved; user must confirm via Bolt database settings and Supabase dashboard.
- Unknown whether user has their own Supabase account/billing or relies on Bolt's built-in database.
- Unknown Bolt plan tier (Pro/Teams vs standard).
- URL mismatch needs resolution before relying on stored data.
- No `.bolt/prompt` present; no global user instructions to reference.