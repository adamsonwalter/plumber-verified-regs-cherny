/*
  # Enforce active subscription on job mutations

  ## Purpose
  Existing jobs remain readable after a subscription lapses, but creating,
  editing, deleting, or changing their regulations must require an active
  subscription. This prevents bypassing the read-only state through direct
  API requests.

  ## Security changes
  - Adds `has_active_subscription()` as a SECURITY DEFINER helper with a
    fixed search path and authenticated-only execution.
  - Replaces job UPDATE and DELETE policies with active-subscription checks.
  - Replaces job item INSERT, UPDATE, and DELETE policies with active-
    subscription checks.
  - SELECT access remains owner-scoped so lapsed users retain their data.
*/

CREATE OR REPLACE FUNCTION has_active_subscription()
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
      AND s.status IN ('active', 'trialing')
  );
$$;

REVOKE EXECUTE ON FUNCTION has_active_subscription() FROM anon;
GRANT EXECUTE ON FUNCTION has_active_subscription() TO authenticated;

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs" ON jobs FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND has_active_subscription())
WITH CHECK (auth.uid() = user_id AND has_active_subscription());

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs" ON jobs FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND has_active_subscription());

DROP POLICY IF EXISTS "insert_own_job_items" ON job_items;
CREATE POLICY "insert_own_job_items" ON job_items FOR INSERT
TO authenticated
WITH CHECK (
  has_active_subscription()
  AND EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "update_own_job_items" ON job_items;
CREATE POLICY "update_own_job_items" ON job_items FOR UPDATE
TO authenticated
USING (
  has_active_subscription()
  AND EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid()
  )
)
WITH CHECK (
  has_active_subscription()
  AND EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "delete_own_job_items" ON job_items;
CREATE POLICY "delete_own_job_items" ON job_items FOR DELETE
TO authenticated
USING (
  has_active_subscription()
  AND EXISTS (
    SELECT 1 FROM jobs
    WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid()
  )
);
