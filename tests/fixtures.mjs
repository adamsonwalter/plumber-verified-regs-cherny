// Test users A and B, created through the Supabase admin API.
//
// This is fixture setup, not a UI test: it does not exercise the sign-up
// screen (row A2 does, in the browser). It exists so the entitlement and
// Stripe-state tests have two real users with real JWTs to act as.
//
//   node tests/fixtures.mjs create   # idempotent; prints user ids
//   node tests/fixtures.mjs tokens   # prints a fresh access token for each
//   node tests/fixtures.mjs destroy  # removes both users and their rows
import { SUPABASE_URL, ANON_KEY, serviceKey, A_EMAIL, B_EMAIL, PASSWORD } from './lib/env.mjs'

const admin = (path, init = {}) =>
  fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

async function findByEmail(email) {
  const r = await admin(`/users?per_page=200`)
  if (!r.ok) throw new Error(`admin list users: ${r.status} ${await r.text()}`)
  const { users } = await r.json()
  return users.find((u) => u.email === email) || null
}

async function ensure(email) {
  const existing = await findByEmail(email)
  if (existing) return { ...existing, created: false }
  const r = await admin('/users', {
    method: 'POST',
    // email_confirm skips the confirmation mail; deliverability is row A5,
    // which is a human observation, not something this harness claims.
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  })
  if (!r.ok) throw new Error(`admin create ${email}: ${r.status} ${await r.text()}`)
  return { ...(await r.json()), created: true }
}

export async function token(email) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!r.ok) throw new Error(`sign in ${email}: ${r.status} ${await r.text()}`)
  return (await r.json()).access_token
}

const cmd = process.argv[2]

if (cmd === 'create') {
  for (const email of [A_EMAIL, B_EMAIL]) {
    const u = await ensure(email)
    console.log(`${u.created ? 'created' : 'exists '}  ${email}  ${u.id}`)
  }
} else if (cmd === 'tokens') {
  for (const email of [A_EMAIL, B_EMAIL]) {
    console.log(`${email}\n  ${await token(email)}\n`)
  }
} else if (cmd === 'destroy') {
  for (const email of [A_EMAIL, B_EMAIL]) {
    const u = await findByEmail(email)
    if (!u) { console.log(`absent   ${email}`); continue }
    const r = await admin(`/users/${u.id}`, { method: 'DELETE' })
    console.log(`${r.ok ? 'deleted ' : `FAILED ${r.status}`}  ${email}`)
  }
} else {
  console.error('usage: node tests/fixtures.mjs create|tokens|destroy')
  process.exit(2)
}
