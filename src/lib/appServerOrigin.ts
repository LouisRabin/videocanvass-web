import { Capacitor } from '@capacitor/core'

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '')
}

/**
 * Origin (scheme + host + optional port, no path) for requests to this app’s `/api/*` routes
 * (Vite dev proxy, Vercel serverless, etc.).
 *
 * - **Browser web:** defaults to `window.location.origin` when `VITE_APP_SERVER_ORIGIN` is unset.
 * - **Capacitor (iOS/Android):** set `VITE_APP_SERVER_ORIGIN` at build time to your deployed HTTPS
 *   site (same host as production web), e.g. `https://your-app.vercel.app`, so bundled assets can
 *   reach `/api/geocode/*` on the server.
 */
export function getAppServerOrigin(): string {
  const fromEnv = trimTrailingSlashes((import.meta.env.VITE_APP_SERVER_ORIGIN as string | undefined)?.trim() ?? '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (import.meta.env.PROD && Capacitor.isNativePlatform()) {
      console.warn(
        '[VideoCanvass] VITE_APP_SERVER_ORIGIN is unset. Geocode /api proxies will not work in the native app until you set it to your production web URL at build time.',
      )
    }
    return window.location.origin
  }
  return ''
}

/**
 * Absolute URL when an origin is known; otherwise same-path relative URL (dev/SSR-friendly).
 * `path` must start with `/`.
 */
export function appServerApiUrl(path: string): string {
  if (!path.startsWith('/')) {
    throw new Error(`appServerApiUrl: path must start with /, got: ${path}`)
  }
  const origin = getAppServerOrigin()
  return origin ? `${origin}${path}` : path
}
