import { relationalBackendEnabled, relationalBackendEnvRaw, relationalBackendFlagParsed } from './backendMode'
import { getAppServerOrigin } from './appServerOrigin'
import { hasSupabaseConfig } from './supabase'

export function vcDebugEnabled(): boolean {
  return (import.meta.env.VITE_VC_DEBUG as string | undefined)?.trim() === 'true'
}

/** Non-secret build fingerprint for misconfiguration triage (host only, no keys). */
export function vcBuildDebugSummary(): string {
  const rel = relationalBackendEnabled()
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
  let host = '(no VITE_SUPABASE_URL)'
  if (url) {
    try {
      host = new URL(url).host
    } catch {
      host = '(invalid VITE_SUPABASE_URL)'
    }
  }
  const rawFlag = relationalBackendEnvRaw()
  const flagNote = rawFlag === '' ? 'empty' : 'set'
  const apiOrigin = (() => {
    try {
      const o = getAppServerOrigin().trim()
      if (!o) return 'api_origin=(empty—Capacitor geocode needs VITE_APP_SERVER_ORIGIN)'
      return `api_origin_host=${new URL(o).host}`
    } catch {
      return 'api_origin=(invalid)'
    }
  })()
  return `relational=${rel} rel_flag=${relationalBackendFlagParsed()} rel_flag_raw=${flagNote} supabase_host=${host} has_supabase_config=${hasSupabaseConfig} ${apiOrigin}`
}
