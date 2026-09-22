import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, symlink } from 'node:fs/promises'
import os from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const supportDir = dirname(fileURLToPath(import.meta.url))
const backendRoot = resolve(supportDir, '..', '..')
const projectRoot = resolve(backendRoot, '..')

export type LegacyDatabaseFixture = {
  databasePath: string
  temporaryRoot: string
}

export const createLegacyDatabase = async (prefix: string): Promise<LegacyDatabaseFixture> => {
  const temporaryRoot = await mkdtemp(join(os.tmpdir(), prefix))
  const isolatedProject = join(temporaryRoot, 'project')
  await mkdir(isolatedProject, { recursive: true })
  await cp(join(projectRoot, 'bot'), join(isolatedProject, 'bot'), {
    recursive: true,
    filter: (source) => basename(source) !== 'node_modules',
  })
  await cp(join(projectRoot, 'package.json'), join(isolatedProject, 'package.json'))
  await symlink(join(projectRoot, 'node_modules'), join(isolatedProject, 'node_modules'), 'dir')

  const child = spawn(process.execPath, ['-e', "import('./bot/database.js')"], {
    cwd: isolatedProject,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  const exitCode = await new Promise<number | null>((resolveExit) => child.once('exit', resolveExit))
  if (exitCode !== 0) throw new Error(`Не удалось создать тестовую legacy SQLite.\n${output}`)

  return {
    databasePath: join(isolatedProject, 'data', 'barber.db'),
    temporaryRoot,
  }
}
