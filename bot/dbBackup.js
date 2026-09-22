import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dataDir = join(__dirname, '..', 'data')
const sourcePath = join(dataDir, 'barber.db')
const backupDir = join(dataDir, 'backups')

if (!existsSync(sourcePath)) {
  console.error(`База не найдена: ${sourcePath}`)
  process.exit(1)
}

mkdirSync(backupDir, { recursive: true })

const now = new Date()
const ts = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}-${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}`
const backupPath = join(backupDir, `barber-${ts}.db`)

copyFileSync(sourcePath, backupPath)
console.log(`DB backup created: ${backupPath}`)
