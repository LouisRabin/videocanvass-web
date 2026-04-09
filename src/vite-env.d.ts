/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_VC_RELATIONAL_BACKEND?: string
  readonly VITE_VC_DEBUG?: string
  readonly VITE_SHARED_WORKSPACE_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
