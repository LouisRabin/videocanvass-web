import type { Session, SupabaseClient } from '@supabase/supabase-js'

function readUserId(user: { id?: string } | null | undefined): string {
  return user?.id?.trim() ?? ''
}

function normUuid(s: string): string {
  return s.trim().toLowerCase()
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

function sessionTokenFresh(session: Session | null, now: number): boolean {
  return (
    Boolean(session?.access_token) &&
    Boolean(readUserId(session?.user)) &&
    (typeof session?.expires_at !== 'number' || session.expires_at >= now + WRITE_AUTH_REFRESH_BUFFER_SEC)
  )
}

async function refreshSessionAndReload(sb: SupabaseClient): Promise<Session | null> {
  const { data, error } = await sb.auth.refreshSession()
  if (error?.message) {
    console.warn('[auth] refreshSession (relational client):', error.message)
  }
  let session = data.session ?? null
  if (!session?.access_token) {
    ;({
      data: { session },
    } = await sb.auth.getSession())
  }
  return session
}

/**
 * Single entry for relational writes: ensure a non-expired access token and return ids PostgREST will use.
 * If `alignWithUserId` is set, after refresh the session user must match (normalized uuid) or returns null.
 * Replaces the previous split between `prepareRelationalWriteAuth` and pre-upsert session checks.
 */
export async function ensureRelationalClientSession(
  sb: SupabaseClient,
  alignWithUserId?: string,
): Promise<{ userId: string; accessToken: string } | null> {
  const now = Math.floor(Date.now() / 1000)
  let {
    data: { session },
  } = await sb.auth.getSession()

  if (!sessionTokenFresh(session, now)) {
    session = await refreshSessionAndReload(sb)
  }

  let userId = readUserId(session?.user)
  if (!session?.access_token || !userId) return null

  if (alignWithUserId?.trim()) {
    const need = normUuid(alignWithUserId)
    if (normUuid(userId) !== need) {
      session = await refreshSessionAndReload(sb)
      userId = readUserId(session?.user)
      if (!session?.access_token || normUuid(userId) !== need) return null
    }
  }

  return { userId: normUuid(userId), accessToken: session.access_token }
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
    const {
      data: { user },
      error,
    } = await sb.auth.getUser()
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

/** `getRelationalAuthUserId` hits the Auth API; without a cap, bootstrap can hang until the store 60s timeout. */
export const RELATIONAL_AUTH_USER_ID_TIMEOUT_MS = 14_000

export async function getRelationalAuthUserIdWithTimeout(
  sb: SupabaseClient,
  ms: number = RELATIONAL_AUTH_USER_ID_TIMEOUT_MS,
): Promise<{ uid: string | null; timedOut: boolean }> {
  type Ok = { tag: 'ok'; uid: string | null }
  type To = { tag: 'to' }
  const r = await Promise.race([
    getRelationalAuthUserId(sb).then((uid): Ok => ({ tag: 'ok', uid })),
    new Promise<To>((resolve) => {
      setTimeout(() => resolve({ tag: 'to' }), ms)
    }),
  ])
  if (r.tag === 'to') {
    console.warn(`[auth] getRelationalAuthUserId timed out after ${ms}ms`)
    return { uid: null, timedOut: true }
  }
  return { uid: r.uid, timedOut: false }
}
