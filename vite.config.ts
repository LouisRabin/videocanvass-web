import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
export default defineConfig({
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
})
