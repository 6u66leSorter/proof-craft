import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const frontendDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(frontendDir, '..')
// Локально — legacy API на 8787; визуальные тесты направляют /api на изолированный стенд.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  // Статика и стили общие с legacy-клиентом: читаются из корня без копирования и без правок.
  publicDir: resolve(projectRoot, 'public'),
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/api': apiTarget },
    fs: { allow: [projectRoot] },
  },
  preview: { proxy: { '/api': apiTarget } },
  build: {
    // Как у legacy (Vite 7): lightningcss переписывает rgba() в hex с округлённой альфой и меняет цвета.
    cssMinify: 'esbuild',
  },
})
