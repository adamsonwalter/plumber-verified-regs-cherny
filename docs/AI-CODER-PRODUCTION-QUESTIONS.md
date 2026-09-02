# Questions for the original AI coder

Please answer these questions using current production evidence, not assumptions
from the repository. Do not expose secret values—confirm only whether each
secret exists.

## Current Netlify production

1. Which Git commit SHA is currently deployed at
   `https://plumber-cherny.netlify.app/`?
2. Is `verify_register_scheduled` registered as a Netlify scheduled function in
   production?
3. What is its actual production schedule?
4. Did it run on Monday 31 August 2026? Provide invocation time, result,
   duration, and relevant logs.
5. Is it deployed as a synchronous scheduled function or a background function?
6. If synchronous, how can the complete verification finish within Netlify's
   30-second limit?
7. Does the deployed function successfully import
   `scripts/verify_register.py`, `fsutil.py`, and `requests`?
8. Does Netlify provide a stable invocation ID, and is that ID actually used
   for idempotency?

## Missing published run evidence

9. Why does the live `register.json` have no `last_run`?
10. Why does Settings show `Last checked —` while simultaneously saying
    `Up to date`?
11. Why are the 60 live verification dates distributed across 31 July,
    27 August, and 28 August rather than refreshed by the weekly run?
12. Did the scheduled function run but fail to publish, or did it never
    complete?
13. What should the UI display when no completed weekly run exists?
14. Should `Live data` mean only `downloaded from the network`, rather than
    `recently verified`?
15. At what age should the interface fail closed and display
    `Verification overdue`?

## Git publishing and the two registers

16. Which file is authoritative: root `register.json` or
    `public/register.json`?
17. The scheduled publisher appears to commit only root `register.json`, while
    the website fetches `public/register.json`. How is the updated root file
    copied into the served location?
18. Is there a missing build copy step?
19. Has this complete flow been tested in production?

    `scheduled invocation → live checks → gated result → GitHub commit → Netlify rebuild → updated public/register.json`

20. Are these production environment variables configured?

    - `GIT_PUBLISH_TOKEN`
    - `GIT_REPO`
    - `GIT_BRANCH`
    - `REGISTER_PATH_IN_REPO`

21. Does the GitHub token have the required repository content-write
    permission?
22. What happens if GitHub rejects the commit or the branch advances during a
    run?
23. Does a failed publication leave only an ephemeral sidecar that disappears
    with the function instance?
24. Can the scheduled process ever update one register copy without updating
    the other?

## Verification integrity

25. Has one complete live run succeeded from Netlify's function runtime against
    all 60 sources?
26. Did that run preserve one HTTP session per hostname?
27. Did it successfully pass the Cloudflare-protected BPC sources?
28. Did it correctly process the `.docx` legislation source?
29. Were all `key_substring` and `also_requires` values tested?
30. What happens when one source is unreachable?
31. What happens when a required substring disappears?
32. Can any unsuccessful run publish entries still marked `verified`?
33. Is the canonical register untouched until the entire proposed result passes
    its gate?
34. Is there monitoring or notification when the weekly run fails or becomes
    overdue?

## Documentation and configuration discrepancies

35. Which documentation statements are stale now that the site is deployed?
36. Should the open checklist items saying the schedule and Git publishing are
    unobserved be updated?
37. The README says the build runs a live gate, but `netlify.toml` runs
    `--offline`. Which description is authoritative?
38. The function comments describe it as background-capable, but its filename
    is not `-background.py`. What runtime is actually deployed?
39. Why are `X-Content-Type-Options` and `Referrer-Policy` absent from the root
    `/` response? Does the `/*.html` Netlify rule fail to match `/`?

## Testing

40. Are there automated tests, or only the manual validation runbook?
41. Can tests be added for:

    - root/public register mirroring;
    - missed-run freshness handling;
    - all three trust states;
    - malformed `also_requires`;
    - Git publishing conflicts;
    - scheduled-run idempotency?

42. What production checks have actually been rerun since the August upgrade?

## Bolt migration

43. Do you recommend:

    - moving everything to Bolt; or
    - using Bolt for authentication, database, and Stripe while retaining the
      Netlify Python verifier initially?

44. If everything moves, what Bolt facility will trigger the verifier weekly
    without a browser open?
45. Does that runtime support Python and `requests`?
46. If not, how will the verifier be ported while keeping the gate and scheduled
    agent on one shared implementation?
47. What are Bolt's execution-time limits?
48. Can Bolt's egress successfully fetch all 60 sources, especially
    Cloudflare-protected BPC pages?
49. How will per-host session/cookie reuse be preserved?
50. Where will production secrets live?
51. Where will the canonical register live: Git, database, or a versioned
    object?
52. How will Bolt prevent an ungated register version from being served?
53. If access is subscription-gated, how will the publicly accessible
    `register.json` be protected?
54. How will Stripe entitlement checks be enforced server-side?
55. Which user fields genuinely require cross-device database storage, and
    which preferences should remain local?
56. What is the database backup and restoration plan? Bolt project version
    history does not restore database state.
57. How will PWA installation, offline honesty, external government links, and
    all fail-closed trust states be preserved?
58. What is the smallest migration sequence that allows a paid pilot without
    rewriting the verifier first?

## Required conclusion

Please finish with:

- the confirmed current production architecture;
- the root cause of the missing `last_run`;
- the exact repair required;
- evidence that the repaired weekly cycle works;
- the recommended Bolt architecture; and
- unresolved risks or decisions requiring Walter's input.
