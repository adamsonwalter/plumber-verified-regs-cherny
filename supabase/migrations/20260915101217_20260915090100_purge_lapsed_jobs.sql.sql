/*
  # Delete jobs 90 days after a subscription locks

  Decision record: docs/ACCESS-AND-LIFECYCLE-PLAN.md §0. Kept separate from the
  access migration so that if scheduling is unavailable on this database, the
  lock still applies and only the clean-up is missing.

  ## What counts as lapsed
  A user whose subscription status is outside `active`, `trialing`, `past_due`
  (the statuses that grant access in has_jobs_access()) and whose
  `current_period_end` is more than 90 days ago. Deleting a job cascades to its
  job_items. Accounts, saves and billing records are untouched: the user drops
  back to a free account.

  ## Changes
  1. `purge_lapsed_jobs()` — SECURITY DEFINER, not callable by any client role.
     Returns the number of jobs deleted.
  2. A daily pg_cron schedule at 03:15 UTC, created only if pg_cron is already
     installed. If it is not, this migration still succeeds and a NOTICE says
     the function must be scheduled by hand (or pg_cron enabled first).
*/

CREATE OR REPLACE FUNCTION purge_lapsed_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH lapsed AS (
    SELECT c.user_id
    FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE s.status NOT IN ('active', 'trialing', 'past_due')
      AND s.current_period_end IS NOT NULL
      AND to_timestamp(s.current_period_end) < now() - interval '90 days'
  ), gone AS (
    DELETE FROM jobs j USING lapsed l WHERE j.user_id = l.user_id RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM gone;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION purge_lapsed_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_lapsed_jobs() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('purge-lapsed-jobs', '15 3 * * *', 'SELECT purge_lapsed_jobs()');
  ELSE
    RAISE NOTICE 'pg_cron is not installed: purge_lapsed_jobs() is created but not scheduled.';
  END IF;
END;
$$;
