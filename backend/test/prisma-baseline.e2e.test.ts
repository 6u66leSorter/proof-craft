import assert from 'node:assert/strict'
import { readFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { PersistenceModule } from '../src/persistence/persistence.module.js'
import { UserIdentityRepository } from '../src/persistence/users/user-identity.repository.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const testDir = dirname(fileURLToPath(import.meta.url))
const backendRoot = resolve(testDir, '..')

const expectedTables = [
  'app_notifications',
  'audit_log',
  'chat_messages',
  'feedback_invites',
  'homework_comments',
  'homework_files',
  'homework_reviews',
  'homeworks',
  'private_feedback',
  'student_profile_edits',
  'student_teachers',
  'students',
  'teacher_applications',
  'teachers',
  'user_roles',
  'users',
  'vk_link_tokens',
  'web_login_requests',
  'web_sessions',
].sort()

test('Prisma baseline соответствует 19 legacy-таблицам и repository читает identity', async () => {
  const fixture = await createLegacyDatabase('proof-craft-prisma-')
  const previousDatabaseUrl = process.env.DATABASE_URL

  try {
    const db = new Database(fixture.databasePath)
    const actualTables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => String((row as { name: string }).name))
    assert.deepEqual(actualTables, expectedTables)

    const schema = await readFile(join(backendRoot, 'prisma', 'schema.prisma'), 'utf8')
    const schemaModels = [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]).sort()
    assert.deepEqual(schemaModels, expectedTables)

    const userId = Number(
      db.prepare(`
        INSERT INTO users (telegram_id, first_name, role)
        VALUES (?, ?, ?)
      `).run(9001, 'Prisma Baseline', 'guest').lastInsertRowid,
    )
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, 'student')
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, 'admin')
    db.close()

    process.env.DATABASE_URL = `file:${fixture.databasePath}`
    const moduleRef = await Test.createTestingModule({ imports: [PersistenceModule] }).compile()
    await moduleRef.init()
    try {
      const repository = moduleRef.get(UserIdentityRepository)
      assert.deepEqual(await repository.findByTelegramId(9001), {
        id: userId,
        telegramId: 9001,
        vkUserId: null,
        roles: ['admin', 'student'],
      })
      assert.equal(await repository.findByTelegramId(9999), null)
    } finally {
      await moduleRef.close()
    }
  } finally {
    if (previousDatabaseUrl == null) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
    await rm(fixture.temporaryRoot, { recursive: true, force: true })
  }
})
