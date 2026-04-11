import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Vercel’s Supabase integration sets `SUPABASE_URL` / `SUPABASE_ANON_KEY` (and sometimes
 * `NEXT_PUBLIC_*`), but Vite only exposes `VITE_*` to the client. Map those into the names
 * `src/lib/supabase.ts` reads so a linked project works without duplicating variables.
 */
function resolveSupabaseClientEnv(mode: string, cwd: string): { url: string; anonKey: string } {
  const fileEnv = loadEnv(mode, cwd, '')
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const v = (fileEnv[key] ?? process.env[key] ?? '').toString().trim()
      if (v) return v
    }
    return ''
  }
  return {
    url: pick('VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: pick(
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
    ),
  }
}

/** Supabase packages often ship `sourceMappingURL` without the .map file (or maps reference unpublished src/). */
function stripSupabaseSourcemapRefs(): Plugin {
  return {
    name: 'strip-supabase-sourcemap-refs',
    enforce: 'pre',
    transform(code, id) {
      const norm = id.replace(/\\/g, '/')
      if (!norm.includes('/node_modules/') || !norm.includes('/@supabase/')) return null
      if (!/\.[cm]?js$/.test(norm)) return null
      if (!code.includes('sourceMappingURL')) return null
      const cleaned = code
        .replace(/\/\/[#@] sourceMappingURL=[^\r\n]*/g, '')
        .replace(/\/\*[#@] sourceMappingURL=[^\r\n]*\*\//g, '')
      if (cleaned === code) return null
      return { code: cleaned, map: null }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { url: supabaseUrl, anonKey: supabaseAnonKey } = resolveSupabaseClientEnv(mode, process.cwd())
  const defineSupabase: Record<string, string> = {}
  if (supabaseUrl && supabaseAnonKey) {
    defineSupabase['import.meta.env.VITE_SUPABASE_URL'] = JSON.stringify(supabaseUrl)
    defineSupabase['import.meta.env.VITE_SUPABASE_ANON_KEY'] = JSON.stringify(supabaseAnonKey)
  }

  return {
  base: './',
  plugins: [stripSupabaseSourcemapRefs(), react()],
  resolve: {
    alias: {
      // tslib 2.8 "exports" prefer tslib.es6.mjs; many installs only have .js — esbuild pre-bundle then fails.
      tslib: path.resolve(__dirname, 'node_modules/tslib/tslib.es6.js'),
    },
  },
  optimizeDeps: {
    exclude: [
      '@supabase/supabase-js',
      '@supabase/postgrest-js',
      '@supabase/realtime-js',
      '@supabase/storage-js',
      '@supabase/auth-js',
      '@supabase/functions-js',
    ],
  },
  server: {
    // Cloudflare quick tunnel (*.trycloudflare.com) sets Host to that domain; Vite 6+ blocks unknown hosts by default.
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api/geocode/nominatim-reverse': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/geocode/nominatim-reverse', '/reverse'),
        headers: {
          'User-Agent': 'videocanvass-web-dev',
        },
      },
      '/api/geocode/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/geocode/nominatim', '/search'),
        headers: {
          'User-Agent': 'videocanvass-web-dev',
        },
      },
      '/api/geocode/overpass': {
        target: 'https://overpass-api.de',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/geocode/overpass', '/api/interpreter'),
        headers: {
          'User-Agent': 'videocanvass-web-dev',
        },
      },
      '/api/geocode/photon-api': {
        target: 'https://photon.komoot.io',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/geocode/photon-api', '/api'),
      },
      '/api/geocode/photon-reverse': {
        target: 'https://photon.komoot.io',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/geocode/photon-reverse', '/reverse'),
      },
      '/api/nyc-open-data': {
        target: 'https://data.cityofnewyork.us',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nyc-open-data/, ''),
      },
    },
  },
  define: defineSupabase,
  }
})
