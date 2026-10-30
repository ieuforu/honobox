import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: fileURLToPath(new URL('./ui', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: '../webdist',
    emptyOutDir: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:3100',
      '/v1': 'http://127.0.0.1:3100',
    },
  },
})
