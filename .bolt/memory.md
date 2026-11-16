# Project memory

## Product intent & audience

- Job-related application with a public register/browse mode and authenticated user features.
- Free public browsing (no account needed) plus paid features gated by subscription status.
- Audience includes job seekers who save/tracks jobs and paying users with subscription-gated features.

## Brand personality & voice

- Plain-language, supportive explanations; clarifies technical naming without being pedantic.
- Offers next steps and asks clarifying questions when user intent is ambiguous.

## Visual design & UX direction

- No specific visual, layout, or component details inferred yet.

## Decisions, constraints & rationale

- **Backend:** Supabase used for auth, database, edge functions, and account deletion.
- **Auth:** Sign-in, sign-up, and session persistence via Supabase; only active when connection details are provided at build time.
- **Data:** Jobs and related records stored in Supabase database for signed-in users.
- **Payments:** Stripe integration via Supabase functions; subscription status stored in DB to control paid-feature access.
- **Account deletion:** Handled by a Supabase function that removes user account and associated data.
- **Public register:** Does not depend on Supabase; works without connection details.
- **Naming convention:** "Supabase" (capital S) used in docs/UI; "supabase" (lowercase) used in code (library name, folder names, connection code).
- **Framework:** Vite + React.
- `.bolt/prompt`: No authoritative prompt file present.

## Open questions & assumptions

- Whether user's Supabase naming question stems from a document/invoice/setup-screen mismatch they want to align.
- Whether a plain-language privacy/support overview of Supabase-stored user data is needed.
- Whether any specific Supabase-dependent feature is suspected of not working.
- Exact UI/UX design system, color palette, typography, and layout patterns not yet established in memory.