import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

/**
 * Close the caller's account.
 *
 * Order matters: billing is cancelled first, and if Stripe refuses, the account
 * is left alone. Deleting an account while its subscription keeps charging is
 * the one outcome this must never produce.
 *
 * Deleting the auth user cascades to saves, jobs, job_items and
 * stripe_customers (see 20260915090200_account_deletion_cascade.sql). The Stripe
 * customer itself is kept, so past invoices stay intact for the business's
 * records; only its subscriptions are cancelled.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: { name: 'Bolt Integration', version: '1.0.0' },
});

// Statuses that can still bill or be revived. Anything else is already over.
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: 'Not authenticated' }, 401);

    // The app asks twice before calling this; the server still wants it said.
    const { confirm } = await req.json().catch(() => ({}));
    if (confirm !== true) return json({ error: 'Confirmation required' }, 400);

    const { data: customer, error: customerError } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (customerError) throw customerError;

    if (customer?.customer_id) {
      try {
        const subs = await stripe.subscriptions.list({ customer: customer.customer_id, status: 'all', limit: 100 });
        for (const sub of subs.data) {
          if (LIVE_STATUSES.has(sub.status)) await stripe.subscriptions.cancel(sub.id);
        }
      } catch (error: any) {
        console.error(`Stripe cancel failed for ${customer.customer_id}: ${error.message}`);
        return json({ error: 'Could not cancel billing, so your account was not closed. Please try again or contact support.' }, 502);
      }

      const { error: subRowError } = await supabase
        .from('stripe_subscriptions')
        .delete()
        .eq('customer_id', customer.customer_id);
      if (subRowError) console.error('Could not remove subscription row:', subRowError);
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error(`Delete user failed for ${user.id}: ${deleteError.message}`);
      return json({ error: 'Billing was cancelled, but the account could not be deleted. Please contact support.' }, 500);
    }

    return json({ closed: true }, 200);
  } catch (error: any) {
    console.error(`Close account error: ${error.message}`);
    return json({ error: 'Could not close your account' }, 500);
  }
});
