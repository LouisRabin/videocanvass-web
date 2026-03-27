import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/geocode/maps': {
        target: 'https://geocode.maps.co',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/geocode/maps', '/search'),
      },
      '/api/geocode/nominatim': {
        target: 'https://nominatim.openstreetmap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/geocode/nominatim', '/search'),
        headers: {
          'User-Agent': 'videocanvass-web-dev',
        },
      },
    },
  },
})
