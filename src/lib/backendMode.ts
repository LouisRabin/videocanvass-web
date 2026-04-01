import { hasSupabaseConfig } from './supabase'

/** When true, use Postgres + RLS + Supabase Auth instead of the shared JSON blob (`vc_app_state`). */
export function relationalBackendEnabled(): boolean {
  const flag = (import.meta.env.VITE_VC_RELATIONAL_BACKEND as string | undefined)?.trim()
  return hasSupabaseConfig && flag === 'true'
}
