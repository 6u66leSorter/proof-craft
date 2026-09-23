import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const botToken = '123456:nest-student-profile-token'
const webSessionToken = 'nest-student-profile-web-session'
const studentTelegramId = 7101
const otherStudentTelegramId = 7102
const teacherTelegramId = 7201

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication

const seedStudentProfile = (path: string): void => {
  const db = new Database(path)
  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, role)
    VALUES (?, ?, ?)
  `)
  const studentUserId = Number(
    insertUser.run(studentTelegramId, 'Student', 'student').lastInsertRowid,
  )
  const otherStudentUserId = Number(
    insertUser.run(otherStudentTelegramId, 'Other student', 'student').lastInsertRowid,
  )
  const teacherUserId = Number(
    insertUser.run(teacherTelegramId, 'Teacher', 'teacher').lastInsertRowid,
  )
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
  insertRole.run(studentUserId, 'student')
  insertRole.run(otherStudentUserId, 'student')
  insertRole.run(teacherUserId, 'teacher')

  const insertStudent = db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, about_me, updated_at)
    VALUES (?, ?, '+70000000000', 1, 'studying', ?, '2020-01-01 00:00:00')
  `)
  insertStudent.run(studentUserId, 'Student Profile', 'Исходное описание')
  insertStudent.run(otherStudentUserId, 'Other Student', 'Чужое описание')
  db.prepare(`INSERT INTO teachers (user_id, full_name) VALUES (?, 'Teacher')`)
    .run(teacherUserId)
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(studentUserId, crypto.createHash('sha256').update(webSessionToken).digest('hex'))
  db.close()
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `student-profile-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Profile' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'))
  return params.toString()
}

const authHeaders = (telegramId: number): Record<string, string> => ({
  'x-telegram-init-data': buildTelegramInitData(telegramId),
})

const readStudent = (telegramId: number): { about_me: string | null; updated_at: string } => {
  const db = new Database(databasePath, { readonly: true })
  const row = db.prepare(`
    SELECT s.about_me, s.updated_at
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ?
  `).get(telegramId) as { about_me: string | null; updated_at: string }
  db.close()
  return row
}

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-student-profile-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  seedStudentProfile(databasePath)
  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TELEGRAM_BOT_TOKEN = ''
  process.env.VITE_TELEGRAM_BOT_TOKEN = ''
  process.env.TG_WEBAPP_AUTH = 'strict'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('POST /api/student/about сохраняет trimmed-описание через Prisma', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/student/about',
    headers: authHeaders(studentTelegramId),
    payload: { telegram_id: studentTelegramId, about_me: '  Новое описание  ' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  const student = readStudent(studentTelegramId)
  assert.equal(student.about_me, 'Новое описание')
  assert.notEqual(student.updated_at, '2020-01-01 00:00:00')
  assert.equal(readStudent(otherStudentTelegramId).about_me, 'Чужое описание')
})

test('POST /api/student/about сохраняет пустое описание как NULL', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/student/about',
    headers: authHeaders(studentTelegramId),
    payload: { telegram_id: studentTelegramId, about_me: '   ' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.equal(readStudent(studentTelegramId).about_me, null)
})

test('изменение описания поддерживает web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/student/about',
    headers: { 'x-web-session': webSessionToken },
    payload: { telegram_id: studentTelegramId, about_me: 'Через web-session' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.equal(readStudent(studentTelegramId).about_me, 'Через web-session')
})

test('изменение описания сохраняет validation и порядок auth ошибок', async (context) => {
  await context.test('about_me отсутствует', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/about',
      headers: authHeaders(studentTelegramId),
      payload: { telegram_id: studentTelegramId },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('about_me длиннее 1000 символов', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/about',
      headers: authHeaders(studentTelegramId),
      payload: { telegram_id: studentTelegramId, about_me: 'x'.repeat(1001) },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('validation выполняется до проверки credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/about',
      payload: { telegram_id: studentTelegramId },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/about',
      payload: { telegram_id: studentTelegramId, about_me: 'Описание' },
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/about',
      headers: authHeaders(otherStudentTelegramId),
      payload: { telegram_id: studentTelegramId, about_me: 'Описание' },
    })
    assert.equal(response.statusCode, 403)
  })
})

test('изменение описания одинаково отклоняет unknown и non-student пользователей', async () => {
  for (const telegramId of [9999, teacherTelegramId]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/about',
      headers: authHeaders(telegramId),
      payload: { telegram_id: telegramId, about_me: 'Описание' },
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Только ученик может изменить раздел «Обо мне».',
    })
  }
})
