/*
  # Keep lapsed jobs: stop deleting them 90 days after lockout

  Reverses 20260915090100_purge_lapsed_jobs. Decision record:
  docs/ACCESS-AND-LIFECYCLE-PLAN.md §0 (revised 2026-11-15).

  ## Why
  A job is a name, a note and a list of register entry ids. Keeping it costs
  nothing, and deleting it on a timer meant owing every leaving subscriber a
  warning the app had no reliable way to deliver (no email, in-app notice only).
  Jobs now stay locked until the user resubscribes or closes their account.

  ## What does not change
  - Access: has_jobs_access() still hides jobs from anyone whose subscription
    is not active, trialing or past_due.
  - Close account: deleting the auth user still cascades to jobs and job_items.

  ## Changes
  1. Unschedule the daily `purge-lapsed-jobs` pg_cron job, if pg_cron is
     installed and the job exists.
  2. Drop `purge_lapsed_jobs()` so nothing can call it by hand.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-lapsed-jobs';
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS purge_lapsed_jobs();
