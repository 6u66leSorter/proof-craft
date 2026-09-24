/**
 * Запускает NestJS API на временной детерминированной SQLite для визуальных тестов.
 * Схема берётся из backend/prisma/schema.sql, данные — из seed.mjs. Рабочие данные не затрагиваются:
 * всё происходит во временном каталоге, который удаляется при остановке процесса.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { seedVisualDatabase } from './seed.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const backendDir = join(projectRoot, 'backend')
const port = Number(process.env.VISUAL_API_PORT || 18787)

const temporaryRoot = await mkdtemp(join(os.tmpdir(), 'proof-craft-visual-'))
const databasePath = join(temporaryRoot, 'data', 'barber.db')
mkdirSync(join(temporaryRoot, 'data', 'uploads'), { recursive: true })

const db = new Database(databasePath)
db.pragma('journal_mode = WAL')
db.exec(readFileSync(join(backendDir, 'prisma', 'schema.sql'), 'utf8'))
db.close()
await seedVisualDatabase(databasePath)

const api = spawn(join(backendDir, 'node_modules', '.bin', 'tsx'), ['src/main.ts'], {
  cwd: backendDir,
  stdio: 'inherit',
  env: {
    PATH: process.env.PATH,
    TG_WEBAPP_AUTH: 'strict',
    BOT_TOKEN: '123456:visual-test-token',
    VK_APP_SECRET: 'visual-test-vk-secret',
    CHAT_ENABLED: 'true',
    NEST_API_HOST: '127.0.0.1',
    NEST_API_PORT: String(port),
    DATABASE_URL: `file:${databasePath}`,
  },
})

let stopping = false
const stop = async (code = 0) => {
  if (stopping) return
  stopping = true
  if (api.exitCode == null) api.kill('SIGTERM')
  await rm(temporaryRoot, { recursive: true, force: true })
  process.exit(code)
}
api.on('exit', (code) => void stop(code ?? 1))
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
