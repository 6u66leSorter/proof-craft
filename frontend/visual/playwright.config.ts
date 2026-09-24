import { defineConfig } from '@playwright/test'
import type { VisualOptions } from './fixtures'

const apiPort = Number(process.env.VISUAL_API_PORT || 18787)
const appPort = Number(process.env.VISUAL_APP_PORT || 14173)
const legacyViteBin = '../node_modules/vite/bin/vite.js'
const nextViteBin = 'node_modules/vite/bin/vite.js'
/** `legacy` снимает и проверяет эталоны; `next` сравнивает новый клиент с ними же. */
export const target = process.env.VISUAL_TARGET === 'next' ? 'next' : 'legacy'

// С нового клиента можно только дописать отсутствующие эталоны согласованных отклонений (visual/deviations.ts):
// режим missing никогда не перезаписывает существующие эталоны legacy.
const updateArgs = process.argv.filter((arg) => arg === '-u' || arg.startsWith('--update-snapshots'))
if (target === 'next' && updateArgs.some((arg) => arg !== '--update-snapshots=missing')) {
  throw new Error('Эталоны снимаются с legacy-клиента. Для нового клиента допустим только --update-snapshots=missing (отклонения).')
}

const appServer: { command: string; cwd: string; env: Record<string, string> } =
  target === 'next'
    ? {
        command:
          `node ${nextViteBin} build --logLevel warn && ` +
          `node ${nextViteBin} preview --host 127.0.0.1 --port ${appPort} --strictPort`,
        cwd: '..',
        env: { VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}` },
      }
    : {
        command:
          `node ${legacyViteBin} build --config visual/vite.legacy.config.mjs --logLevel warn && ` +
          `node ${legacyViteBin} preview --config visual/vite.legacy.config.mjs --host 127.0.0.1 --port ${appPort} --strictPort`,
        cwd: '..',
        env: { VISUAL_API_PORT: String(apiPort) },
      }

/**
 * Визуальный baseline legacy-клиента. Эталоны лежат в `__screenshots__/<project>/`
 * и позже служат критерием приёмки для экранов нового клиента.
 */
export default defineConfig<VisualOptions>({
  testDir: '.',
  testMatch: ['**/*.visual.ts', '**/*.behavior.ts'],
  outputDir: `./test-results/${target}`,
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: `./playwright-report/${target}`, open: 'never' }]],
  expect: {
    toHaveScreenshot: { maxDiffPixels: 0, threshold: 0, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
    trace: 'retain-on-failure',
    launchOptions: {
      // Детерминированная растеризация: без асинхронного декодирования картинок, GPU-растра и LCD-сглаживания.
      args: [
        '--force-color-profile=srgb',
        '--disable-checker-imaging',
        '--disable-partial-raster',
        '--disable-skia-runtime-opts',
        '--disable-gpu-rasterization',
        '--disable-lcd-text',
        '--run-all-compositor-stages-before-draw',
      ],
    },
  },
  projects: [
    { name: 'light-390', use: { viewport: { width: 390, height: 844 }, theme: 'light' } },
    { name: 'dark-390', use: { viewport: { width: 390, height: 844 }, theme: 'dark' } },
    { name: 'light-360', use: { viewport: { width: 360, height: 800 }, theme: 'light' } },
    { name: 'dark-360', use: { viewport: { width: 360, height: 800 }, theme: 'dark' } },
  ],
  webServer: [
    {
      command: 'node visual/legacy-api/start.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${apiPort}/health`,
      env: { VISUAL_API_PORT: String(apiPort) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      ...appServer,
      url: `http://127.0.0.1:${appPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
