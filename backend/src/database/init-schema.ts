import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

/** prisma/schema.sql рядом с src/ и dist/: путь одинаков для tsx и собранного образа. */
const schemaPath = fileURLToPath(new URL('../../prisma/schema.sql', import.meta.url))

/**
 * Создаёт схему в пустой SQLite. Базу, где таблицы уже есть, не меняет:
 * миграции существующих баз пока не поддерживаются (см. docs/DECISIONS.md).
 */
export const initSchema = (databasePath: string): 'created' | 'exists' => {
  mkdirSync(join(dirname(databasePath), 'uploads'), { recursive: true })
  const db = new Database(databasePath)
  try {
    db.pragma('journal_mode = WAL')
    const hasTables = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get()
    if (hasTables) return 'exists'
    db.exec(`BEGIN; ${readFileSync(schemaPath, 'utf8')}; COMMIT;`)
    return 'created'
  } finally {
    db.close()
  }
}

const databaseUrl = process.env.DATABASE_URL?.trim()
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!databaseUrl?.startsWith('file:')) throw new Error('Для инициализации схемы требуется абсолютный SQLite DATABASE_URL.')
  const databasePath = fileURLToPath(new URL(databaseUrl))
  const result = initSchema(databasePath)
  console.log(result === 'created' ? `Схема создана: ${databasePath}` : `Схема уже есть: ${databasePath}`)
}
