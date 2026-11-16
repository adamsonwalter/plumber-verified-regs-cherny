/*
  # Log of subscription lifecycle emails

  The stripe-webhook function emails a subscriber when they cancel ("your jobs
  lock on <date>") and when the subscription ends ("your jobs are locked and
  kept"). Stripe redelivers events, so each send is claimed here first, keyed
  on the Stripe event id: a redelivered event finds its row and sends nothing.

  The row also records what happened, so a failed or skipped send is visible
  instead of silent.

  ## New table
  - `subscription_emails`
    - `event_id` (text, primary key) — Stripe event id, the dedupe key
    - `customer_id` (text) — Stripe customer id
    - `kind` (text) — `cancel_scheduled` or `locked`
    - `status` (text) — `pending`, `sent`, `failed` or `skipped`
    - `detail` (text) — error text, or why it was skipped
    - `created_at` (timestamptz)

  ## Security
  RLS enabled with no policies: only the service role (the webhook) can read
  or write. It holds no email address and no message body.
*/

CREATE TABLE IF NOT EXISTS subscription_emails (
  event_id text PRIMARY KEY,
  customer_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cancel_scheduled', 'locked')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_emails ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS subscription_emails_customer_idx ON subscription_emails (customer_id);
