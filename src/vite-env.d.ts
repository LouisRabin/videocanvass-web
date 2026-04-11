/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Production web origin for `/api/*` (geocode proxies). Required for Capacitor iOS/Android release builds. */
  readonly VITE_APP_SERVER_ORIGIN?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Public app URL with scheme, e.g. `https://your-app.vercel.app` — used for password-reset `redirectTo` if needed. */
  readonly VITE_VC_SITE_URL?: string
  readonly VITE_VC_RELATIONAL_BACKEND?: string
  readonly VITE_VC_DEBUG?: string
  readonly VITE_SHARED_WORKSPACE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
