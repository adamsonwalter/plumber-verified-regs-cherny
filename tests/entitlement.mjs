// Rows E1–E3: is the paywall real, or decorative?
//
// Deliberately not a browser test. The UI is the thing being bypassed, so
// these call the data API and the create_job RPC directly with each user's
// own JWT — exactly what a curious customer with devtools would do.
import { SUPABASE_URL, ANON_KEY, A_EMAIL, B_EMAIL } from './lib/env.mjs'
import { token } from './fixtures.mjs'

const results = []
const record = (id, what, expected, pass, detail) => {
  results.push({ id, what, expected, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}\n        ${detail}`)
}

async function api(path, jwt, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  return { status: r.status, body: await r.text() }
}

const insertJob = (jwt, name) =>
  api('/jobs', jwt, { method: 'POST', body: JSON.stringify({ name }) })

const rpcCreateJob = (jwt, name) =>
  api('/rpc/create_job', jwt, { method: 'POST', body: JSON.stringify({ p_name: name }) })

const jwtB = await token(B_EMAIL)
const jwtA = await token(A_EMAIL)

// E1 — direct table insert as an unsubscribed user must be refused by RLS.
{
  const r = await insertJob(jwtB, 'E1 direct insert (should fail)')
  record('E1', 'free user B inserts into jobs directly', 'rejected',
    r.status >= 400, `HTTP ${r.status} ${r.body.slice(0, 200)}`)
}

// E2 — the RPC is SECURITY INVOKER, so the same INSERT policy must stop it.
{
  const r = await rpcCreateJob(jwtB, 'E2 rpc (should fail)')
  record('E2', 'free user B calls create_job()', 'rejected',
    r.status >= 400, `HTTP ${r.status} ${r.body.slice(0, 200)}`)
}

// E3 — a rule that blocks everyone is an outage, not entitlement.
{
  const r = await rpcCreateJob(jwtA, 'E3 rpc (should succeed)')
  const ok = r.status < 400
  record('E3', 'subscribed user A calls create_job()', 'succeeds',
    ok, `HTTP ${r.status} ${r.body.slice(0, 200)}`)
  if (ok) {
    const id = JSON.parse(r.body)?.id ?? JSON.parse(r.body)?.[0]?.id
    if (id) await api(`/jobs?id=eq.${id}`, jwtA, { method: 'DELETE' })
  }
}

// B5 / D4 cross-tenant read, cheap to assert here as well.
{
  const r = await api('/jobs?select=id,user_id', jwtB)
  const rows = r.status < 400 ? JSON.parse(r.body) : null
  record('D4', "user B lists jobs and sees none of A's", 'empty',
    Array.isArray(rows) && rows.length === 0, `HTTP ${r.status} ${r.body.slice(0, 200)}`)
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
