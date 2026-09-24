import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Локально — NestJS API на 8788; визуальные тесты направляют /api на изолированный стенд.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8788'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': apiTarget },
  },
  preview: { proxy: { '/api': apiTarget } },
  build: {
    // lightningcss переписывает rgba() в hex с округлённой альфой и меняет цвета — эталоны сняты с esbuild.
    cssMinify: 'esbuild',
  },
})
