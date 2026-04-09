import { hasSupabaseConfig } from './supabase'

function parseTruthyEnv(raw: string | undefined): boolean {
  if (raw == null) return false
  let s = raw.trim()
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim()
  }
  const t = s.toLowerCase()
  return t === 'true' || t === '1' || t === 'yes' || t === 'on'
}

/** Raw `VITE_VC_RELATIONAL_BACKEND` after trim (for diagnostics only). */
export function relationalBackendEnvRaw(): string {
  return (import.meta.env.VITE_VC_RELATIONAL_BACKEND as string | undefined)?.trim() ?? ''
}

/** Whether the relational flag is set to a truthy value (not whether Supabase URL/key exist). */
export function relationalBackendFlagParsed(): boolean {
  return parseTruthyEnv(import.meta.env.VITE_VC_RELATIONAL_BACKEND as string | undefined)
}

/** When true, use Postgres + RLS + Supabase Auth instead of the shared JSON blob (`vc_app_state`). */
export function relationalBackendEnabled(): boolean {
  return hasSupabaseConfig && relationalBackendFlagParsed()
}
