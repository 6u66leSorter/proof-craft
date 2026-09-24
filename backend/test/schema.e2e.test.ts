import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import test from 'node:test'
import Database from 'better-sqlite3'
import { initSchema } from '../src/database/init-schema.js'
import { createTestDatabase } from './support/test-database.js'

test('initSchema создаёт схему в пустой базе и не трогает базу с данными', async () => {
  const fixture = await createTestDatabase('proof-craft-schema-')
  try {
    const db = new Database(fixture.databasePath)
    const tables = db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).get() as { n: number }
    assert.equal(tables.n, 19)
    db.prepare(`INSERT INTO users (telegram_id, first_name) VALUES (1, 'Проверка')`).run()
    db.close()

    assert.equal(initSchema(fixture.databasePath), 'exists')
    const check = new Database(fixture.databasePath, { readonly: true })
    assert.equal((check.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n, 1)
    check.close()
  } finally {
    await rm(fixture.temporaryRoot, { recursive: true, force: true })
  }
})
