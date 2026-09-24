/**
 * Запускает API на изолированной копии `bot/` и детерминированной SQLite для визуальных тестов.
 * Рабочие `data/` и `bot/` проекта не изменяются: всё происходит во временном каталоге,
 * который удаляется при остановке процесса.
 *
 * VISUAL_BACKEND=legacy (по умолчанию) — на порту работает только legacy API.
 * VISUAL_BACKEND=split — как в переходной production-топологии: роутер на порту отправляет
 * маршруты со статусом `nest-ready` из docs/migration/API_INVENTORY.md в NestJS, остальные — в legacy.
 * Оба процесса работают с одной БД и одним каталогом uploads.
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedVisualDatabase } from './seed.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const port = Number(process.env.VISUAL_API_PORT || 18787)
const split = process.env.VISUAL_BACKEND === 'split'
const legacyPort = split ? port + 100 : port
const nestPort = port + 200

const temporaryRoot = await mkdtemp(join(os.tmpdir(), 'proof-craft-visual-'))
const isolatedProject = join(temporaryRoot, 'project')
await cp(join(projectRoot, 'bot'), join(isolatedProject, 'bot'), { recursive: true })
await writeFile(join(isolatedProject, 'package.json'), JSON.stringify({ type: 'module' }))
await symlink(join(projectRoot, 'node_modules'), join(isolatedProject, 'node_modules'), 'dir')

// Импорт database.js создаёт схему и выполняет legacy-миграции до сида.
const init = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./bot/database.js')"], {
  cwd: isolatedProject,
  stdio: 'inherit',
})
if (init.status !== 0) throw new Error('Не удалось создать схему legacy SQLite')

const databasePath = join(isolatedProject, 'data', 'barber.db')
await seedVisualDatabase(databasePath, projectRoot)

const sharedEnv = {
  PATH: process.env.PATH,
  TG_WEBAPP_AUTH: 'strict',
  BOT_TOKEN: '123456:visual-test-token',
  VK_APP_SECRET: 'visual-test-vk-secret',
  CHAT_ENABLED: 'true',
}

const children = []
const api = spawn(process.execPath, ['bot/apiServer.js'], {
  cwd: isolatedProject,
  stdio: 'inherit',
  env: { ...sharedEnv, API_HOST: '127.0.0.1', API_PORT: String(legacyPort), API_PREFIX_STRIP_REWRITE: '0' },
})
children.push(api)

let stopping = false
const stop = async (code = 0) => {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode == null) child.kill('SIGTERM')
  await rm(temporaryRoot, { recursive: true, force: true })
  process.exit(code)
}
api.on('exit', (code) => void stop(code ?? 1))
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())

if (split) {
  const backendDir = join(projectRoot, 'backend')
  const nest = spawn(join(backendDir, 'node_modules', '.bin', 'tsx'), ['src/main.ts'], {
    cwd: backendDir,
    stdio: 'inherit',
    env: { ...sharedEnv, NEST_API_HOST: '127.0.0.1', NEST_API_PORT: String(nestPort), DATABASE_URL: `file:${databasePath}` },
  })
  children.push(nest)
  nest.on('exit', (code) => void stop(code ?? 1))
  await startRouter()
}

/** Маршруты `nest-ready` из реестра API → регулярные выражения по методу и пути. */
function nestReadyRoutes() {
  const inventory = readFileSync(join(projectRoot, 'docs', 'migration', 'API_INVENTORY.md'), 'utf8')
  return inventory
    .split('\n')
    .filter((line) => /^\| (GET|POST|PATCH) /.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells[6] === 'nest-ready')
    .map(([, method, path]) => {
      const pattern = path.replace(/`/g, '').replace(/:[A-Za-z_]+/g, '[^/]+')
      return { method, path: path.replace(/`/g, ''), regex: new RegExp(`^${pattern}$`) }
    })
}

async function waitFor(url) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // процесс ещё запускается
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Не дождался ${url}`)
}

async function startRouter() {
  const routes = nestReadyRoutes()
  await Promise.all([waitFor(`http://127.0.0.1:${legacyPort}/health`), waitFor(`http://127.0.0.1:${nestPort}/health`)])
  const served = { nest: 0, legacy: 0 }
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    const toNest = path === '/health' || routes.some((r) => r.method === req.method && r.regex.test(path))
    served[toNest ? 'nest' : 'legacy']++
    const upstream = http.request(
      { host: '127.0.0.1', port: toNest ? nestPort : legacyPort, method: req.method, path: req.url, headers: req.headers },
      (response) => {
        res.writeHead(response.statusCode ?? 502, { ...response.headers, 'x-served-by': toNest ? 'nest' : 'legacy' })
        response.pipe(res)
      },
    )
    upstream.on('error', (error) => {
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: `Прокси: ${error.message}` }))
    })
    req.pipe(upstream)
  })
  server.listen(port, '127.0.0.1', () => {
    console.log(`Split API на :${port} — ${routes.length} маршрутов → NestJS :${nestPort}, остальные → legacy :${legacyPort}`)
  })
  process.on('exit', () => console.log(`Split API обслужил: NestJS ${served.nest}, legacy ${served.legacy}`))
}
