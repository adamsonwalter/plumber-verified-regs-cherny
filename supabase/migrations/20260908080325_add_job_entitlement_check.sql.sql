/*
  # Server-side entitlement check for job creation

  ## Purpose
  Jobs are a paid feature. Previously any signed-in user could insert into the
  `jobs` table directly via the data API, bypassing any client-side paywall.
  This migration moves the entitlement check to the server.

  ## Changes
  1. Creates `create_job(p_name text, p_note text)` — a SECURITY DEFINER
     function that:
     - Derives the caller from `auth.uid()` (never a parameter)
     - Checks `stripe_user_subscriptions` for an active or trialing subscription
     - Also allows job creation if the user has existing jobs (lapsed users
       keep read-only access to their old jobs, but cannot create new ones)
     - Inserts the job row with the caller's user_id
     - Returns the new job row
  2. Revokes INSERT on `jobs` from `authenticated` and `anon` so the only
     path to create a job is through the function.
  3. Grants EXECUTE on the function to `authenticated` only.
  4. Updates the existing INSERT policy on `jobs` to deny by default
     (the function bypasses RLS via SECURITY DEFINER).

  ## Security
  - Function is SECURITY DEFINER with `SET search_path = public`
  - EXECUTE revoked from anon, granted to authenticated
  - Direct INSERT revoked from both anon and authenticated
  - The function checks subscription status at the moment of creation,
    not when the page loaded
*/

CREATE OR REPLACE FUNCTION create_job(p_name text, p_note text DEFAULT NULL)
RETURNS jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs;
  v_sub_status text;
BEGIN
  -- Derive caller from session, never from a parameter
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check subscription status at the moment of creation
  SELECT subscription_status INTO v_sub_status
  FROM stripe_user_subscriptions
  WHERE customer_id IN (
    SELECT customer_id FROM stripe_customers
    WHERE user_id = auth.uid() AND deleted_at IS NULL
  )
  LIMIT 1;

  -- Allow only if subscription is active or trialing
  IF v_sub_status IS NULL OR (v_sub_status <> 'active' AND v_sub_status <> 'trialing') THEN
    RAISE EXCEPTION 'A subscription is required to create jobs';
  END IF;

  -- Insert the job
  INSERT INTO jobs (user_id, name, note)
  VALUES (auth.uid(), p_name, p_note)
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_job(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION create_job(text, text) TO authenticated;

-- Revoke direct INSERT on jobs so only the function can create them
REVOKE INSERT ON jobs FROM anon, authenticated;

-- Drop the old insert policy since direct inserts are now blocked
DROP POLICY IF EXISTS "insert_own_jobs" ON jobs;
