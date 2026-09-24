import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

/**
 * Собирает legacy-клиент из корня проекта для визуального baseline, не трогая корневые
 * `vite.config.js`, `dist/` и `.env`: env читается из этого каталога (в нём нет .env),
 * поэтому клиент ходит в относительный `/api`, а preview проксирует его на изолированный API.
 */
const visualDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(visualDir, '..', '..')
const apiTarget = `http://127.0.0.1:${process.env.VISUAL_API_PORT || 18787}`

export default defineConfig({
  root: projectRoot,
  envDir: visualDir,
  cacheDir: join(visualDir, '..', 'node_modules', '.vite-legacy'),
  build: { outDir: join(visualDir, '.legacy-dist'), emptyOutDir: true },
  preview: { proxy: { '/api': apiTarget } },
})
