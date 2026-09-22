import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
})
