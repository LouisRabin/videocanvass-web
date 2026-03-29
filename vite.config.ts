import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
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
      '/api/nyc-open-data': {
        target: 'https://data.cityofnewyork.us',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nyc-open-data/, ''),
      },
    },
  },
})
