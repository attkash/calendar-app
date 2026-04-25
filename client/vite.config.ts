import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
const backendPort = process.env.PORT || '3000'
const backendTarget = `http://localhost:${backendPort}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/generate': backendTarget,
      '/api': backendTarget,
    },
  },
})
