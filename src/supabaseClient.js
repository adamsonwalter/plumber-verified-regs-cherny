import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * True only when this build was given database configuration.
 *
 * The register is free and public — browsing it needs no account and no
 * database. But createClient() throws "supabaseUrl is required" when the env
 * vars are absent, and it throws at module load, before React mounts. That
 * turned missing account config into a blank page for the whole product,
 * including the free tier that does not use the database at all.
 *
 * The vars exist inside Bolt but not in a plain checkout, and not on a host
 * until they are set there by hand, so the failure showed up nowhere during
 * development and everywhere else.
 *
 * So: never throw here. Fall back to a syntactically valid placeholder so the
 * client constructs, and let the UI hide every account feature behind
 * `authAvailable`. A missing or rotated key now costs sign-in, not the app.
 */
export const authAvailable = Boolean(supabaseUrl && supabaseAnonKey)

if (!authAvailable && typeof console !== 'undefined') {
  console.warn(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
    'The register works; account features are disabled for this build.'
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://unconfigured.invalid',
  supabaseAnonKey || 'unconfigured',
  {
    auth: {
      persistSession: authAvailable,
      autoRefreshToken: authAvailable,
      detectSessionInUrl: authAvailable,
    },
  }
)
