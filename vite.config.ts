import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        alerts: 'alerts.html',
        mapContext: 'map-context.html',
      },
    },
  },
  server: {
    port: 4173,
    strictPort: true,
  },
})
