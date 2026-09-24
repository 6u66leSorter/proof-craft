/**
 * Запускает legacy API на изолированной копии `bot/` и детерминированной SQLite для визуальных тестов.
 * Рабочие `data/` и `bot/` проекта не изменяются: всё происходит во временном каталоге,
 * который удаляется при остановке процесса.
 */
import { spawn, spawnSync } from 'node:child_process'
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedVisualDatabase } from './seed.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const port = Number(process.env.VISUAL_API_PORT || 18787)

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

await seedVisualDatabase(join(isolatedProject, 'data', 'barber.db'), projectRoot)

const api = spawn(process.execPath, ['bot/apiServer.js'], {
  cwd: isolatedProject,
  stdio: 'inherit',
  env: {
    PATH: process.env.PATH,
    API_HOST: '127.0.0.1',
    API_PORT: String(port),
    API_PREFIX_STRIP_REWRITE: '0',
    TG_WEBAPP_AUTH: 'strict',
    BOT_TOKEN: '123456:visual-test-token',
    VK_APP_SECRET: 'visual-test-vk-secret',
    CHAT_ENABLED: 'true',
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
