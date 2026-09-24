import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { createTestDatabase } from './support/test-database.js'

const botToken = '123456:nest-session-contract-token'
const vkSecret = 'nest-session-vk-secret'
const webSessionToken = 'nest-session-web-token'
const studentTelegramId = 3001
const vkUserId = 7001
const vkClaimedTelegramId = 10_000_000_000 + vkUserId

let temporaryRoot: string
let app: NestFastifyApplication

const seedSessionFixture = (databasePath: string): void => {
  const db = new Database(databasePath)
  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role, vk_user_id)
    VALUES (?, ?, ?, ?, ?)
  `)
  const studentUserId = Number(
    insertUser.run(studentTelegramId, 'Анна', 'Ученица', 'student', vkUserId).lastInsertRowid,
  )
  const teacherUserId = Number(
    insertUser.run(2001, 'Ирина', 'Преподаватель', 'teacher', null).lastInsertRowid,
  )
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(studentUserId, 'student')
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(teacherUserId, 'teacher')

  const studentId = Number(
    db.prepare(`
      INSERT INTO students
        (user_id, full_name, phone, lessons_count, status, student_track, metro, about_me, avatar_file_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      studentUserId,
      'Анна Ученица',
      '+79990000001',
      10,
      'studying',
      'intern',
      'Центральная',
      'О студенте',
      '/tmp/avatar.jpg',
    ).lastInsertRowid,
  )
  const teacherId = Number(
    db.prepare('INSERT INTO teachers (user_id, full_name, about_me) VALUES (?, ?, ?)')
      .run(teacherUserId, '  Ирина   Преподаватель  ', 'О преподавателе').lastInsertRowid,
  )
  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
    .run(studentId, teacherId)

  const homeworkId = Number(
    db.prepare(`
      INSERT INTO homeworks (student_id, lesson_number, content_type, status)
      VALUES (?, 1, 'text', 'approved')
    `).run(studentId).lastInsertRowid,
  )
  const insertReview = db.prepare(`
    INSERT INTO homework_reviews (homework_id, teacher_id, rating, status)
    VALUES (?, ?, ?, ?)
  `)
  insertReview.run(homeworkId, teacherId, 4, 'approved')
  insertReview.run(homeworkId, teacherId, 5, 'approved')
  insertReview.run(homeworkId, teacherId, 1, 'rejected')

  db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, read_at)
    VALUES (?, 'contract', 'Непрочитанное', NULL)
  `).run(studentUserId)
  db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, read_at)
    VALUES (?, 'contract', 'Прочитанное', datetime('now'))
  `).run(studentUserId)

  const tokenHash = crypto.createHash('sha256').update(webSessionToken).digest('hex')
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(studentUserId, tokenHash)
  db.close()
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `nest-contract-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Contract' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'))
  return params.toString()
}

const buildVkLaunchParams = (): string => {
  const params = new URLSearchParams({
    vk_app_id: '54558405',
    vk_user_id: String(vkUserId),
  })
  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&')
  params.set('sign', crypto.createHmac('sha256', vkSecret).update(checkString).digest('base64url'))
  return params.toString()
}

const expectedStudentSession = {
  ok: true,
  data: {
    hasUser: true,
    role: 'student',
    roles: ['student'],
    isAdmin: false,
    isTeacher: false,
    isStudent: true,
    isGuest: false,
    student: {
      id: 1,
      full_name: 'Анна Ученица',
      phone: '+79990000001',
      lessons_count: 10,
      status: 'studying',
      student_track: 'intern',
      metro: 'Центральная',
      about_me: 'О студенте',
      has_avatar: true,
      average_rating: 4.5,
      ratings_count: 2,
      teachers: [{ id: 1, full_name: 'Ирина Преподаватель' }],
    },
    teacher: null,
    unread_notifications_count: 1,
    vk_account_linked: true,
  },
}

before(async () => {
  const fixture = await createTestDatabase('proof-craft-session-')
  temporaryRoot = fixture.temporaryRoot
  seedSessionFixture(fixture.databasePath)
  process.env.DATABASE_URL = `file:${fixture.databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TELEGRAM_BOT_TOKEN = ''
  process.env.VITE_TELEGRAM_BOT_TOKEN = ''
  process.env.TG_WEBAPP_AUTH = 'strict'
  process.env.VK_APP_ID = '54558405'
  process.env.VK_APP_SECRET = vkSecret
  process.env.VK_ID_OFFSET = '10000000000'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('GET /api/session сохраняет полный legacy-контракт ученика', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/session?telegram_id=${studentTelegramId}`,
    headers: { 'x-telegram-init-data': buildTelegramInitData(studentTelegramId) },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedStudentSession)
})

test('GET /session поддерживает nginx, который срезает префикс /api', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/session?telegram_id=${studentTelegramId}`,
    headers: { 'x-telegram-init-data': buildTelegramInitData(studentTelegramId) },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedStudentSession)
})

test('GET /api/session принимает действующую web-session', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/session?telegram_id=${studentTelegramId}`,
    headers: { 'x-web-session': webSessionToken },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedStudentSession)
})

test('GET /api/session разрешает VK-пользователя по подписанным launch params', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/session?telegram_id=${vkClaimedTelegramId}`,
    headers: {
      'x-client-platform': 'vk',
      'x-vk-user-id': String(vkUserId),
      'x-app-user-id': String(vkClaimedTelegramId),
      'x-vk-launch-params': buildVkLaunchParams(),
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedStudentSession)
})

test('GET /api/session возвращает гостевой контракт для подписанного неизвестного пользователя', async () => {
  const unknownTelegramId = 9999
  const response = await app.inject({
    method: 'GET',
    url: `/api/session?telegram_id=${unknownTelegramId}`,
    headers: { 'x-telegram-init-data': buildTelegramInitData(unknownTelegramId) },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    data: {
      hasUser: false,
      role: null,
      roles: [],
      isAdmin: false,
      isTeacher: false,
      isStudent: false,
      isGuest: false,
      student: null,
      teacher: null,
      unread_notifications_count: 0,
      vk_account_linked: false,
    },
  })
})

test('strict Telegram auth сохраняет коды и форму ошибок legacy API', async (context) => {
  await context.test('нет init data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/session?telegram_id=${studentTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
    assert.deepEqual(response.json(), {
      ok: false,
      error:
        'Требуется заголовок X-Telegram-Init-Data. Откройте мини-апп из Telegram или задайте TG_WEBAPP_AUTH=optional для разработки.',
    })
  })

  await context.test('подписан другой telegram_id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/session?telegram_id=${studentTelegramId}`,
      headers: { 'x-telegram-init-data': buildTelegramInitData(3002) },
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'telegram_id не совпадает с подписью Telegram.',
    })
  })

  await context.test('некорректный query', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/session?telegram_id=oops' })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })
})
