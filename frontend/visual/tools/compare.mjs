/**
 * Ручное сравнение клиентов: поднимает изолированный legacy API с тестовыми данными,
 * собирает legacy и новый клиент и открывает их рядом в окнах Chromium под выбранной ролью.
 * Оба клиента работают с одной временной БД; рабочие data/ и bot/ не затрагиваются.
 *
 *   npm run compare -- student      # admin | teacher | student | intern | moderation | newcomer | guest | login
 */
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { VISUAL_SESSIONS } from '../legacy-api/sessions.mjs'

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const role = process.argv[2] || 'student'
const API_PORT = 18787
const LEGACY_PORT = 14173
const NEXT_PORT = 14174

if (!(role in VISUAL_SESSIONS) && role !== 'guest' && role !== 'login') {
  console.error(`Неизвестная роль «${role}». Доступно: ${[...Object.keys(VISUAL_SESSIONS), 'guest', 'login'].join(', ')}`)
  process.exit(1)
}

const children = []
const run = (label, command, env = {}) => {
  const child = spawn(command, { cwd: frontendDir, shell: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`))
  children.push(child)
  return child
}

const waitFor = async (url, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // сервер ещё запускается
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Не дождался ${url}`)
}

const stop = () => {
  for (const child of children) if (child.exitCode == null) child.kill('SIGTERM')
}
process.on('SIGINT', () => {
  stop()
  process.exit(0)
})

console.log('Запускаю legacy API с тестовыми данными…')
run('api', 'node visual/legacy-api/start.mjs', { VISUAL_API_PORT: String(API_PORT) })
await waitFor(`http://127.0.0.1:${API_PORT}/health`)

console.log('Собираю и запускаю оба клиента…')
const legacyVite = '../node_modules/vite/bin/vite.js'
const nextVite = 'node_modules/vite/bin/vite.js'
run(
  'legacy',
  `node ${legacyVite} build --config visual/vite.legacy.config.mjs --logLevel warn && node ${legacyVite} preview --config visual/vite.legacy.config.mjs --host 127.0.0.1 --port ${LEGACY_PORT} --strictPort`,
  { VISUAL_API_PORT: String(API_PORT) },
)
run(
  'next',
  `node ${nextVite} build --logLevel warn && node ${nextVite} preview --host 127.0.0.1 --port ${NEXT_PORT} --strictPort`,
  { VITE_API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
)
await Promise.all([waitFor(`http://127.0.0.1:${LEGACY_PORT}`), waitFor(`http://127.0.0.1:${NEXT_PORT}`)])

const token = VISUAL_SESSIONS[role] ?? null
const search = role === 'guest' ? '?guest=1' : ''
const browsers = []

/** Отдельное окно размером с телефон: без эмуляции viewport страница занимает всё окно и центрируется как обычно. */
const open = async (title, port, left) => {
  const args = [`--window-size=420,900`, `--window-position=${left},40`, '--lang=ru-RU']
  const browser = await chromium.launch({ headless: false, channel: 'chrome', args }).catch(() => chromium.launch({ headless: false, args }))
  browsers.push(browser)
  const context = await browser.newContext({ viewport: null, locale: 'ru-RU' })
  await context.addInitScript(
    ({ token, title }) => {
      if (!sessionStorage.getItem('__compare_ready')) {
        if (token) localStorage.setItem('ba_web_session', token)
        else localStorage.removeItem('ba_web_session')
        sessionStorage.setItem('__compare_ready', '1')
      }
      document.addEventListener('DOMContentLoaded', () => {
        document.title = title
      })
    },
    { token, title },
  )
  const page = context.pages()[0] ?? (await context.newPage())
  await page.goto(`http://127.0.0.1:${port}/${search}`)
  browser.on('disconnected', () => {
    stop()
    process.exit(0)
  })
}

await open('LEGACY', LEGACY_PORT, 40)
await open('NEW (React)', NEXT_PORT, 480)

console.log(`
Готово. Роль: ${role}
  legacy:        http://127.0.0.1:${LEGACY_PORT}/${search}
  новый клиент:  http://127.0.0.1:${NEXT_PORT}/${search}
Слева окно LEGACY, справа NEW (React). Данные общие и временные.
Сменить роль в открытом окне: DevTools → localStorage.setItem('ba_web_session', '<токен>'); location.reload()
Токены: ${Object.entries(VISUAL_SESSIONS).map(([k, v]) => `${k}=${v}`).join(', ')}
Остановить: Ctrl+C в терминале.
`)
