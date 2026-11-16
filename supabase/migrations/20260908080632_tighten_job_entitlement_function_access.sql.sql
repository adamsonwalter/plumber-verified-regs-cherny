/*
  # Tighten entitlement function access

  The first entitlement migration left default PUBLIC EXECUTE privileges on
  helper functions. Job creation now runs as the caller and the active
  subscription check lives in the INSERT policy, so no SECURITY DEFINER RPC is
  exposed to clients.
*/

CREATE OR REPLACE FUNCTION create_job(p_name text, p_note text DEFAULT NULL)
RETURNS jobs
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_job jobs;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO jobs (user_id, name, note)
  VALUES (auth.uid(), p_name, p_note)
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION create_job(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_job(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_job(text, text) TO authenticated;

REVOKE ALL ON FUNCTION has_active_subscription() FROM PUBLIC;
REVOKE ALL ON FUNCTION has_active_subscription() FROM anon, authenticated;

GRANT INSERT ON jobs TO authenticated;
REVOKE INSERT ON jobs FROM anon;

CREATE POLICY "insert_own_jobs" ON jobs FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid()
      AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND s.status IN ('active', 'trialing')
  )
);

DROP POLICY IF EXISTS "update_own_jobs" ON jobs;
CREATE POLICY "update_own_jobs" ON jobs FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid() AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.status IN ('active', 'trialing')
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid() AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.status IN ('active', 'trialing')
  )
);

DROP POLICY IF EXISTS "delete_own_jobs" ON jobs;
CREATE POLICY "delete_own_jobs" ON jobs FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid() AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.status IN ('active', 'trialing')
  )
);

DROP POLICY IF EXISTS "insert_own_job_items" ON job_items;
CREATE POLICY "insert_own_job_items" ON job_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid() AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.status IN ('active', 'trialing')
  )
  AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
);

DROP POLICY IF EXISTS "update_own_job_items" ON job_items;
CREATE POLICY "update_own_job_items" ON job_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid() AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.status IN ('active', 'trialing')
  )
  AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid() AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.status IN ('active', 'trialing')
  )
  AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
);

DROP POLICY IF EXISTS "delete_own_job_items" ON job_items;
CREATE POLICY "delete_own_job_items" ON job_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM stripe_customers c
    JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.user_id = auth.uid() AND c.deleted_at IS NULL
      AND s.deleted_at IS NULL AND s.status IN ('active', 'trialing')
  )
  AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_items.job_id AND jobs.user_id = auth.uid())
);
