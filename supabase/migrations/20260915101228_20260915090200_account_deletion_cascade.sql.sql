/*
  # Let an account be deleted after it has paid

  `stripe_customers.user_id` referenced auth.users with no ON DELETE rule, so
  deleting any user who had ever reached checkout was refused by the database.
  saves, jobs and job_items already cascade; this brings the billing link in
  line so the delete-account function can remove a user in one step.

  The Stripe customer in Stripe is not touched, and delete-account cancels its
  subscriptions before deleting the user.
*/

DO $$
DECLARE
  v_name text;
BEGIN
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
  WHERE con.conrelid = 'public.stripe_customers'::regclass
    AND con.contype = 'f'
    AND att.attname = 'user_id';

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stripe_customers DROP CONSTRAINT %I', v_name);
  END IF;
END;
$$;

ALTER TABLE public.stripe_customers
  ADD CONSTRAINT stripe_customers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
