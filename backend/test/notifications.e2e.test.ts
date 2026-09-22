import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const botToken = '123456:nest-notifications-contract-token'
const webSessionToken = 'nest-notifications-web-token'
const studentTelegramId = 7101

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
let fixtureIds: { homework: number; student: number }

const seedNotifications = (path: string): typeof fixtureIds => {
  const db = new Database(path)
  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, role)
    VALUES (?, ?, 'student')
  `)
  const aliceUserId = Number(insertUser.run(studentTelegramId, 'Alice').lastInsertRowid)
  const bobUserId = Number(insertUser.run(7102, 'Bob').lastInsertRowid)
  db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, 'student')`).run(aliceUserId)
  db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, 'student')`).run(bobUserId)

  const studentId = Number(
    db.prepare(`
      INSERT INTO students (user_id, full_name, phone, lessons_count, status)
      VALUES (?, 'Алиса', '+70000000000', 1, 'studying')
    `).run(aliceUserId).lastInsertRowid,
  )
  const homeworkId = Number(
    db.prepare(`
      INSERT INTO homeworks (student_id, lesson_number, content_type, status)
      VALUES (?, 1, 'text', 'approved')
    `).run(studentId).lastInsertRowid,
  )

  const insertNotification = db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, payload, read_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  insertNotification.run(
    aliceUserId,
    'homework_update',
    'Работа обновлена',
    JSON.stringify({ homework_id: homeworkId, student_id: studentId }),
    null,
    '2026-09-22 12:00:00',
  )
  insertNotification.run(
    aliceUserId,
    'read_notice',
    'Прочитано',
    JSON.stringify({ homework_id: homeworkId }),
    '2026-09-22 11:30:00',
    '2026-09-21 12:00:00',
  )
  insertNotification.run(
    aliceUserId,
    'invalid_payload',
    'Без payload',
    '{broken',
    '2026-09-20 11:30:00',
    '2026-09-20 12:00:00',
  )
  insertNotification.run(
    aliceUserId,
    'expired',
    'Устаревшее',
    null,
    '2020-01-01 13:00:00',
    '2020-01-01 12:00:00',
  )
  insertNotification.run(
    bobUserId,
    'other_user',
    'Чужое',
    null,
    null,
    '2026-09-23 12:00:00',
  )

  const tokenHash = crypto.createHash('sha256').update(webSessionToken).digest('hex')
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(aliceUserId, tokenHash)
  db.close()
  return { homework: homeworkId, student: studentId }
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `notifications-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Notifications' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'))
  return params.toString()
}

const authHeaders = (telegramId = studentTelegramId): Record<string, string> => ({
  'x-telegram-init-data': buildTelegramInitData(telegramId),
})

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-notifications-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  fixtureIds = seedNotifications(databasePath)
  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TELEGRAM_BOT_TOKEN = ''
  process.env.VITE_TELEGRAM_BOT_TOKEN = ''
  process.env.TG_WEBAPP_AUTH = 'strict'
  process.env.APP_NOTIFICATIONS_RETENTION_DAYS = '90'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('GET /api/notifications возвращает свои записи, payload и unread_count', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/notifications?telegram_id=${studentTelegramId}&limit=3`,
    headers: authHeaders(),
  })
  assert.equal(response.statusCode, 200)
  const body = response.json() as {
    ok: boolean
    data: {
      unread_count: number
      notifications: Array<Record<string, unknown>>
    }
  }
  assert.equal(body.ok, true)
  assert.equal(body.data.unread_count, 1)
  assert.deepEqual(
    body.data.notifications.map(({ id, ...notification }) => {
      assert.ok(Number.isInteger(id) && Number(id) > 0)
      return notification
    }),
    [
      {
        kind: 'homework_update',
        body: 'Работа обновлена',
        payload: { homework_id: fixtureIds.homework, student_id: fixtureIds.student },
        read_at: null,
        created_at: '2026-09-22 12:00:00',
      },
      {
        kind: 'read_notice',
        body: 'Прочитано',
        payload: { homework_id: fixtureIds.homework },
        read_at: '2026-09-22 11:30:00',
        created_at: '2026-09-21 12:00:00',
      },
      {
        kind: 'invalid_payload',
        body: 'Без payload',
        payload: null,
        read_at: '2026-09-20 11:30:00',
        created_at: '2026-09-20 12:00:00',
      },
    ],
  )

  const db = new Database(databasePath, { readonly: true })
  const expiredRow = db
    .prepare(`SELECT COUNT(*) AS count FROM app_notifications WHERE kind = 'expired'`)
    .get() as { count: number } | undefined
  db.close()
  assert.equal(Number(expiredRow?.count ?? 0), 0)
})

test('notifications limit не ограничивает unread_count', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/notifications?telegram_id=${studentTelegramId}&limit=1`,
    headers: authHeaders(),
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.notifications.length, 1)
  assert.equal(response.json().data.unread_count, 1)
})

test('notifications принимает web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/notifications?telegram_id=${studentTelegramId}&limit=3`,
    headers: { 'x-web-session': webSessionToken },
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.notifications.length, 3)
})

test('notifications сохраняет auth, query и unknown-user ошибки', async (context) => {
  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/notifications?telegram_id=${studentTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/notifications?telegram_id=${studentTelegramId}`,
      headers: authHeaders(7102),
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('некорректный limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/notifications?telegram_id=${studentTelegramId}&limit=81`,
      headers: authHeaders(),
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })

  await context.test('подписанный неизвестный пользователь', async () => {
    const unknownTelegramId = 7999
    const response = await app.inject({
      method: 'GET',
      url: `/api/notifications?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Пользователь не найден.',
    })
  })
})
