/** Fragment after Supabase redirects from the reset email (shape varies by hosted vs local). */
export function urlHashIndicatesPasswordRecovery(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hash
  return /type=recovery|type%3Drecovery/i.test(h)
}

/**
 * Supabase treats `redirectTo` without a scheme (e.g. `myapp.vercel.app`) as a **path** on the
 * `*.supabase.co` host, which yields `{"error":"requested path is invalid"}` and a broken URL bar.
 * This helper always returns an absolute `http(s)://…` URL.
 */
function finalizeRedirectUrl(u: URL): string {
  let p = u.pathname
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  const suffix = p === '/' || p === '' ? '/' : `${p}/`
  return `${u.origin}${suffix}`
}

function normalizeAbsoluteAppUrl(raw: string): string | null {
  let t = raw.trim()
  if (!t) return null
  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t.replace(/^\/+/, '')}`
  }
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      u.protocol = 'https:'
    }
    return finalizeRedirectUrl(u)
  } catch {
    return null
  }
}

/**
 * `redirectTo` for `supabase.auth.resetPasswordForEmail`.
 * Must be listed under Supabase Dashboard → Authentication → URL configuration → **Redirect URLs**
 * (e.g. `https://www.cameracanvass.com/**`).
 *
 * Optional **`VITE_VC_SITE_URL`**: set to your public app origin if `window.location` is wrong
 * (e.g. some WebViews). Example: `https://www.cameracanvass.com`
 */
export function passwordRecoveryRedirectTo(): string {
  const envRaw = (import.meta.env.VITE_VC_SITE_URL as string | undefined)?.trim()
  if (envRaw) {
    const fromEnv = normalizeAbsoluteAppUrl(envRaw)
    if (fromEnv) return fromEnv
  }

  if (typeof window === 'undefined') return ''

  try {
    const u = new URL(window.location.href)
    u.hash = ''
    u.search = ''
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      const h = window.location.hostname
      if (h) return normalizeAbsoluteAppUrl(h) ?? `https://${h}/`
      console.warn(
        '[auth] Cannot derive https URL for password reset; set VITE_VC_SITE_URL (e.g. https://www.cameracanvass.com).',
      )
      return ''
    }
    if (u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      u.protocol = 'https:'
    }
    return finalizeRedirectUrl(u)
  } catch {
    const host = window.location.host || 'localhost'
    const isLocal = /^localhost$|^127\.0\.0\.1$/i.test(window.location.hostname)
    const proto = window.location.protocol === 'http:' && isLocal ? 'http:' : 'https:'
    return `${proto}//${host}/`
  }
}
