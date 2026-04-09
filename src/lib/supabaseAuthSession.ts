import type { Session, SupabaseClient } from '@supabase/supabase-js'

function readUserId(user: { id?: string } | null | undefined): string {
  return user?.id?.trim() ?? ''
}

/**
 * Session we can treat as "signed in" for app bootstrap. Clears broken state:
 * no access token, or access token already expired (common after switching Supabase projects / env).
 * Without this, `getSession()` still has `user` while relational load blocks on dead JWT + slow `getUser()`.
 */
export async function getUsableSessionOrSignOut(sb: SupabaseClient): Promise<Session | null> {
  const {
    data: { session },
  } = await sb.auth.getSession()
  if (!session?.user) return null
  if (!session.access_token) {
    await sb.auth.signOut()
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  const exp = session.expires_at
  if (typeof exp === 'number' && exp <= now) {
    await sb.auth.signOut()
    return null
  }
  return session
}

/** Seconds before access-token expiry when we proactively refresh (PostgREST uses JWT `sub` as `auth.uid()`). */
const WRITE_AUTH_REFRESH_BUFFER_SEC = 120

/**
 * Refresh session if needed, then return the user id that matches the **access token** PostgREST sends.
 * Use this immediately before relational writes: `getUser()` alone can succeed while `getSession()` still
 * has no/expired `access_token`, so RLS sees `auth.uid()` as null and rejects `vc_cases` inserts.
 */
export async function prepareRelationalWriteAuth(sb: SupabaseClient): Promise<{ userId: string } | null> {
  const now = Math.floor(Date.now() / 1000)
  let {
    data: { session },
  } = await sb.auth.getSession()

  const expiresAt = session?.expires_at
  const tokenFresh =
    Boolean(session?.access_token) &&
    typeof expiresAt === 'number' &&
    expiresAt >= now + WRITE_AUTH_REFRESH_BUFFER_SEC

  if (!session?.access_token || !readUserId(session.user) || !tokenFresh) {
    const { data, error } = await sb.auth.refreshSession()
    if (error?.message) {
      console.warn('[auth] refreshSession (relational write):', error.message)
    }
    session = data.session ?? session
    if (!session?.access_token) {
      ;({
        data: { session },
      } = await sb.auth.getSession())
    }
  }

  const userId = readUserId(session?.user)
  if (!session?.access_token || !userId) return null
  return { userId }
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
