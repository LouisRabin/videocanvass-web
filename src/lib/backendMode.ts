import { debugSessionLog } from './debugSessionLog'
import { hasSupabaseConfig } from './supabase'

/** Debug mode: log relational gate once (avoid spam — this function is hot). */
let _vcRelationalGateDebugLogged = false

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
  if (!hasSupabaseConfig) {
    if (!_vcRelationalGateDebugLogged) {
      _vcRelationalGateDebugLogged = true
      debugSessionLog({
        location: 'backendMode.ts:relationalBackendEnabled',
        message: 'relational_gate',
        hypothesisId: 'B',
        data: {
          result: false,
          reason: 'no_supabase_config',
          urlSet: Boolean((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()),
          keySet: Boolean((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()),
          viteProd: import.meta.env.PROD,
        },
      })
    }
    return false
  }
  const raw = import.meta.env.VITE_VC_RELATIONAL_BACKEND as string | undefined
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  const result = trimmed !== '' ? parseTruthyEnv(raw) : import.meta.env.PROD
  if (!_vcRelationalGateDebugLogged) {
    _vcRelationalGateDebugLogged = true
    const explicitTruthy = trimmed !== '' ? parseTruthyEnv(raw) : null
    let supabaseUrlHostOk = false
    try {
      supabaseUrlHostOk = Boolean(new URL(String(import.meta.env.VITE_SUPABASE_URL).trim()).host)
    } catch {
      supabaseUrlHostOk = false
    }
    debugSessionLog({
      location: 'backendMode.ts:relationalBackendEnabled',
      message: 'relational_gate',
      hypothesisId: 'A-D',
      data: {
        result,
        flagEmpty: trimmed === '',
        flagExplicitTruthy: explicitTruthy,
        viteProd: import.meta.env.PROD,
        supabaseUrlHostOk,
      },
    })
  }
  return result
}
