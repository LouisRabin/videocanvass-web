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

/**
 * When true, use Postgres + RLS + Supabase Auth instead of the shared JSON blob (`vc_app_state`).
 *
 * - If `VITE_VC_RELATIONAL_BACKEND` is set to any non-empty value, it is parsed as truthy/falsey (`true` / `false` / `1` / `0` / …).
 * - If it is **unset or blank** and `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set: **production builds** default to
 *   relational ON so Vercel deploys are not stuck in mock “demo sign-in” when the flag was forgotten (Vite bakes env at build time).
 * - **Development** (`npm run dev`): unset/blank still means relational OFF unless you set the flag to a truthy value.
 */
export function relationalBackendEnabled(): boolean {
  if (!hasSupabaseConfig) return false
  const raw = import.meta.env.VITE_VC_RELATIONAL_BACKEND as string | undefined
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed !== '') {
    return parseTruthyEnv(raw)
  }
  return import.meta.env.PROD
}
