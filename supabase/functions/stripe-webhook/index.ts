import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'Bolt Integration',
    version: '1.0.0',
  },
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return new Response('No signature found', { status: 400, headers: corsHeaders });
    }

    const body = await req.text();

    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
    } catch (error: any) {
      console.error(`Webhook signature verification failed: ${error.message}`);
      return new Response(`Webhook signature verification failed: ${error.message}`, { status: 400, headers: corsHeaders });
    }

    // Sync before acknowledging. A 200 tells Stripe the event is handled and it
    // never retries; if the database write then fails, access drifts from what
    // the customer is paying for. A 500 makes Stripe redeliver, and the sync is
    // an upsert of Stripe's current state, so redelivery is safe.
    await handleEvent(event);

    return Response.json({ received: true }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return Response.json({ error: 'Webhook processing failed' }, { status: 500, headers: corsHeaders });
  }
});

async function handleEvent(event: Stripe.Event) {
  const stripeData = event?.data?.object ?? {};

  if (!stripeData) {
    return;
  }

  if (!('customer' in stripeData)) {
    return;
  }

  if (event.type === 'payment_intent.succeeded' && event.data.object.invoice === null) {
    return;
  }

  const { customer: customerId } = stripeData;

  if (!customerId || typeof customerId !== 'string') {
    console.error(`No customer received on event: ${JSON.stringify(event)}`);
    return;
  }

  let isSubscription = true;

  if (event.type === 'checkout.session.completed') {
    const { mode } = stripeData as Stripe.Checkout.Session;
    isSubscription = mode === 'subscription';
    console.info(`Processing ${isSubscription ? 'subscription' : 'one-time payment'} checkout session`);
  }

  const { mode, payment_status } = stripeData as Stripe.Checkout.Session;

  if (isSubscription) {
    console.info(`Starting subscription sync for customer: ${customerId}`);
    await syncCustomerFromStripe(customerId);
    // After the sync, never instead of it: access is already correct by the
    // time anyone is told about it, and a failed email never fails the event.
    await sendLifecycleEmail(event, customerId);
  } else if (mode === 'payment' && payment_status === 'paid') {
    try {
      const {
        id: checkout_session_id,
        payment_intent,
        amount_subtotal,
        amount_total,
        currency,
      } = stripeData as Stripe.Checkout.Session;

      const { error: orderError } = await supabase.from('stripe_orders').insert({
        checkout_session_id,
        payment_intent_id: payment_intent,
        customer_id: customerId,
        amount_subtotal,
        amount_total,
        currency,
        payment_status,
        status: 'completed',
      });

      if (orderError) {
        console.error('Error inserting order:', orderError);
        return;
      }
      console.info(`Successfully processed one-time payment for session: ${checkout_session_id}`);
    } catch (error) {
      console.error('Error processing one-time payment:', error);
    }
  }
}

async function syncCustomerFromStripe(customerId: string) {
  try {
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 1,
      status: 'all',
      expand: ['data.default_payment_method'],
    });

    if (subscriptions.data.length === 0) {
      console.info(`No active subscriptions found for customer: ${customerId}`);
      const { error: noSubError } = await supabase.from('stripe_subscriptions').upsert(
        {
          customer_id: customerId,
          status: 'not_started',
        },
        {
          onConflict: 'customer_id',
        },
      );

      if (noSubError) {
        console.error('Error updating subscription status:', noSubError);
        throw new Error('Failed to update subscription status in database');
      }
      return;
    }

    const subscription = subscriptions.data[0];

    const { error: subError } = await supabase.from('stripe_subscriptions').upsert(
      {
        customer_id: customerId,
        subscription_id: subscription.id,
        price_id: subscription.items.data[0].price.id,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
        cancel_at_period_end: subscription.cancel_at_period_end,
        ...(subscription.default_payment_method && typeof subscription.default_payment_method !== 'string'
          ? {
              payment_method_brand: subscription.default_payment_method.card?.brand ?? null,
              payment_method_last4: subscription.default_payment_method.card?.last4 ?? null,
            }
          : {}),
        status: subscription.status,
      },
      {
        onConflict: 'customer_id',
      },
    );

    if (subError) {
      console.error('Error syncing subscription:', subError);
      throw new Error('Failed to sync subscription in database');
    }
    console.info(`Successfully synced subscription for customer: ${customerId}`);
  } catch (error) {
    console.error(`Failed to sync subscription for customer ${customerId}:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Subscription lifecycle emails
//
// Two service messages, both about the customer's own account:
//   cancel_scheduled — they cancelled; says when Jobs locks and that jobs are kept
//   locked           — the subscription has ended; jobs are locked and kept
//
// Stripe decides when; this only reports it. Sending needs RESEND_API_KEY and
// EMAIL_FROM in the function secrets. Without them every send is recorded as
// `skipped`, so this is safe to deploy before a sender is set up.
// ---------------------------------------------------------------------------

type EmailKind = 'cancel_scheduled' | 'locked';

// Set by delete-account when it cancels billing on the way to deleting the
// user. Nobody who just closed their account wants "your jobs are safe".
const ACCOUNT_CLOSED_COMMENT = 'account_closed';

const emailDate = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Australia/Melbourne',
});

function lifecycleEmailKind(event: Stripe.Event): EmailKind | null {
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    return sub.cancellation_details?.comment === ACCOUNT_CLOSED_COMMENT ? null : 'locked';
  }
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    const before = (event.data.previous_attributes ?? {}) as Record<string, unknown>;
    // Only the moment it flips to "will end". Stripe expresses that as
    // cancel_at_period_end or as a cancel_at date, depending on API version.
    const flaggedNow = sub.cancel_at_period_end === true && before.cancel_at_period_end === false;
    const datedNow = sub.cancel_at != null && 'cancel_at' in before && before.cancel_at == null;
    return flaggedNow || datedNow ? 'cancel_scheduled' : null;
  }
  return null;
}

function subscriptionEndDate(sub: Stripe.Subscription): string | null {
  const seconds =
    sub.cancel_at ??
    (sub as any).current_period_end ??
    (sub.items?.data?.[0] as any)?.current_period_end ??
    null;
  return typeof seconds === 'number' ? emailDate.format(new Date(seconds * 1000)) : null;
}

function composeEmail(kind: EmailKind, sub: Stripe.Subscription): { subject: string; text: string } {
  const appUrl = Deno.env.get('APP_URL');
  const comeBack = appUrl
    ? `To pick them up again, sign in at ${appUrl} and choose Subscribe in Settings.`
    : 'To pick them up again, sign in and choose Subscribe in Settings.';
  const footer = [
    'Your account, saved regs and the register itself stay free to use.',
    '',
    'VIC PlumberRegs',
    "You're getting this because it's about your Jobs subscription.",
  ];

  if (kind === 'cancel_scheduled') {
    const date = subscriptionEndDate(sub);
    return {
      subject: date ? `Your jobs lock on ${date}, and we keep them for you` : 'Your Jobs subscription is set to end',
      text: [
        date
          ? `You've cancelled Jobs. It stays open until ${date}, then your jobs lock.`
          : "You've cancelled Jobs. It stays open until the end of the period you've paid for, then your jobs lock.",
        '',
        'Nothing is deleted. We keep every job exactly as you left it, and they come back the moment you resubscribe.',
        '',
        "If you'll need a job record while you're away, download it before then: open the job and choose Download job record.",
        '',
        'Changed your mind? Open Settings, choose Manage billing and keep the subscription.',
        '',
        ...footer,
      ].join('\n'),
    };
  }

  return {
    subject: 'Your jobs are locked, and safe',
    text: [
      'Your Jobs subscription has ended, so your jobs are now locked.',
      '',
      'Nothing is deleted. We keep every job exactly as you left it, for as long as you keep your account.',
      '',
      comeBack,
      '',
      ...footer,
    ].join('\n'),
  };
}

async function sendLifecycleEmail(event: Stripe.Event, customerId: string) {
  const kind = lifecycleEmailKind(event);
  if (!kind) return;

  try {
    // Claim the event. A redelivery hits the primary key and stops here.
    const { error: claimError } = await supabase
      .from('subscription_emails')
      .insert({ event_id: event.id, customer_id: customerId, kind });
    if (claimError) {
      if (claimError.code !== '23505') console.error('Could not record lifecycle email:', claimError);
      return;
    }

    const finish = (status: 'sent' | 'failed' | 'skipped', detail: string | null) =>
      supabase.from('subscription_emails').update({ status, detail }).eq('event_id', event.id);

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM');
    if (!apiKey || !from) {
      await finish('skipped', 'RESEND_API_KEY or EMAIL_FROM not set');
      return;
    }

    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', customerId)
      .maybeSingle();
    const { data: userData } = customer?.user_id
      ? await supabase.auth.admin.getUserById(customer.user_id)
      : { data: null };
    const to = userData?.user?.email;
    if (!to) {
      await finish('skipped', 'No account for this customer');
      return;
    }

    const { subject, text } = composeEmail(kind, event.data.object as Stripe.Subscription);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });

    if (response.ok) {
      await finish('sent', null);
      console.info(`Sent ${kind} email for customer ${customerId}`);
    } else {
      await finish('failed', `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      console.error(`Lifecycle email ${kind} failed for ${customerId}: HTTP ${response.status}`);
    }
  } catch (error: any) {
    console.error(`Lifecycle email ${kind} errored for ${customerId}: ${error.message}`);
    await supabase
      .from('subscription_emails')
      .update({ status: 'failed', detail: String(error.message).slice(0, 300) })
      .eq('event_id', event.id);
  }
}
