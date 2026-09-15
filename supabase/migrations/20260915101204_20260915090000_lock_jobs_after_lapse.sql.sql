/*
  # Lock jobs after a subscription lapses, with grace for failed payments

  Replaces the "readable forever" intent of
  20260908080447_enforce_active_subscription_on_job_mutations. Decision record:
  docs/ACCESS-AND-LIFECYCLE-PLAN.md §0.

  ## Access rule
  A user has access to Jobs — read and write — while their subscription status
  is `active`, `trialing` or `past_due`.

  - `past_due` is the grace period. Stripe is retrying a failed card, and a
    customer whose card simply expired keeps working while they fix it. How
    long this lasts is set in Stripe (Billing → Revenue recovery), not here:
    configure retries to finish within about 7 days and then cancel the
    subscription.
  - Voluntary cancellation stays `active` until the paid period ends (Stripe's
    cancel-at-period-end), then becomes `canceled`.
  - Any other status — `canceled`, `unpaid`, `incomplete_expired`, `paused` —
    locks reads as well as writes. Jobs are hidden, not deleted.

  Deletion 90 days after lockout is a separate migration
  (20260915090100_purge_lapsed_jobs.sql), so a scheduling failure there cannot
  block this access change.

  ## Changes
  1. `has_jobs_access()` — SECURITY DEFINER, fixed search_path, callable only
     by `authenticated`. It reads billing tables the caller could otherwise
     only reach through RLS, and returns a boolean for auth.uid() only.
  2. SELECT, INSERT, UPDATE and DELETE policies on `jobs` and `job_items`
     rebuilt on that one rule, replacing the inline status checks that listed
     only `active` and `trialing`.
*/

CREATE OR REPLACE FUNCTION has_jobs_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid()
      AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND s.status IN ('active', 'trialing', 'past_due')
  );
$$;

REVOKE ALL ON FUNCTION has_jobs_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION has_jobs_access() FROM anon;
GRANT EXECUTE ON FUNCTION has_jobs_access() TO authenticated;

-- jobs
DROP POLICY IF EXISTS "select_own_jobs" ON jobs;
CREATE POLICY "select_own_jobs" ON jobs FOR SELECT
  TO authenticated USING (auth.uid() = user_id AND has_jobs_access());

DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id AND has_jobs_access());

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs" ON jobs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND has_jobs_access())
  WITH CHECK (auth.uid() = user_id AND has_jobs_access());

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs" ON jobs FOR DELETE
  TO authenticated USING (auth.uid() = user_id AND has_jobs_access());

-- job_items
DROP POLICY IF EXISTS "select_own_job_items" ON job_items;
CREATE POLICY "select_own_job_items" ON job_items FOR SELECT
  TO authenticated USING (
    has_jobs_access()
    AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_own_job_items" ON job_items;
CREATE POLICY "insert_own_job_items" ON job_items FOR INSERT
  TO authenticated WITH CHECK (
    has_jobs_access()
    AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_job_items" ON job_items;
CREATE POLICY "update_own_job_items" ON job_items FOR UPDATE
  TO authenticated
  USING (
    has_jobs_access()
    AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  )
  WITH CHECK (
    has_jobs_access()
    AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_own_job_items" ON job_items;
CREATE POLICY "delete_own_job_items" ON job_items FOR DELETE
  TO authenticated USING (
    has_jobs_access()
    AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
  );
