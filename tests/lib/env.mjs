// Reads .env at the repo root. No dependency, no dotenv.
// Every secret used by the harness lives there and .env is gitignored.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const env = {}
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* no .env — require() below will report what is missing */ }

export function require_(name, why) {
  const v = process.env[name] || env[name]
  if (!v) {
    console.error(`\nMissing ${name} in .env — needed to ${why}.`)
    process.exit(2)
  }
  return v
}

export const SUPABASE_URL = require_('VITE_SUPABASE_URL', 'reach the project')
export const ANON_KEY = require_('VITE_SUPABASE_ANON_KEY', 'sign in as a test user')
export const serviceKey = () =>
  require_('SUPABASE_SERVICE_ROLE_KEY', 'create and delete the test users A and B')
export const stripeKey = () =>
  require_('STRIPE_SECRET_KEY', 'drive Stripe test-mode subscription states')

export const A_EMAIL = env.TEST_EMAIL_A || 'harness-a@example.test'
export const B_EMAIL = env.TEST_EMAIL_B || 'harness-b@example.test'
export const PASSWORD = env.TEST_PASSWORD || 'harness-Passw0rd!-do-not-reuse'
