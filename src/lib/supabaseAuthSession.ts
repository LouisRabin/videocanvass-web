import type { SupabaseClient } from '@supabase/supabase-js'

function readUserId(user: { id?: string } | null | undefined): string {
  return user?.id?.trim() ?? ''
}

/**
 * User id that PostgREST will treat as `auth.uid()` for RLS.
 *
 * Prefer this over `getSession()` alone before relational reads/writes: after sleep, new deploy tab,
 * or clock skew, the in-memory session can look valid while the access JWT is expired — then RLS
 * sees `auth.uid()` as null and rejects `vc_cases` inserts.
 *
 * Flow: `getUser()` (validates with Auth server) → optional `refreshSession()` → `getUser()` again → last-chance `getSession()`.
 */
export async function getRelationalAuthUserId(sb: SupabaseClient): Promise<string | null> {
  const tryGetUser = async () => {
    const { data: { user }, error } = await sb.auth.getUser()
    return { uid: readUserId(user), error }
  }

  let { uid, error } = await tryGetUser()
  if (uid) return uid
  if (error?.message) {
    console.warn('[auth] getUser before relational API:', error.message)
  }

  const { data: refreshed, error: refErr } = await sb.auth.refreshSession()
  if (refErr?.message) {
    console.warn('[auth] refreshSession:', refErr.message)
  } else {
    uid = readUserId(refreshed.session?.user)
    if (uid) return uid
  }

  const afterRefresh = await tryGetUser()
  if (afterRefresh.uid) return afterRefresh.uid

  const {
    data: { session },
  } = await sb.auth.getSession()
  return readUserId(session?.user) || null
}
