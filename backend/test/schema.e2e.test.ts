import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { initSchema } from '../src/database/init-schema.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const readSchema = (databasePath: string) => {
  const db = new Database(databasePath, { readonly: true })
  try {
    return db
      .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`)
      .all()
  } finally {
    db.close()
  }
}

test('prisma/schema.sql создаёт ту же схему, что legacy bot/database.js, и не трогает существующую базу', async () => {
  const legacy = await createLegacyDatabase('proof-craft-schema-legacy-')
  const temporaryRoot = await mkdtemp(join(os.tmpdir(), 'proof-craft-schema-'))
  try {
    const databasePath = join(temporaryRoot, 'barber.db')
    assert.equal(initSchema(databasePath), 'created')
    assert.deepEqual(readSchema(databasePath), readSchema(legacy.databasePath))
    assert.equal(initSchema(databasePath), 'exists')
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
    await rm(legacy.temporaryRoot, { recursive: true, force: true })
  }
})
