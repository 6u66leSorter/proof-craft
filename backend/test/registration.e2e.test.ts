import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { UserNotificationGateway } from '../src/notifications/user-notification.gateway.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const botToken = '123456:nest-registration-token'
const vkSecret = 'nest-registration-vk-secret'
const adminTelegramId = 8701
const studentTelegramId = 8702
const studentWebSession = 'nest-registration-web-session'
const sentNotifications: Array<{ telegramId: number; message: string }> = []

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
let adminUserId: number
let studentUserId: number

const buildTelegramInitData = (telegramId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `registration-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: 'Registration' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set(
    'hash',
    crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'),
  )
  return params.toString()
}

const buildVkLaunchParams = (vkUserId: number): string => {
  const params = new URLSearchParams({
    vk_app_id: '54558405',
    vk_user_id: String(vkUserId),
  })
  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&')
  params.set(
    'sign',
    crypto.createHmac('sha256', vkSecret).update(checkString).digest('base64url'),
  )
  return params.toString()
}

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-registration-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  const db = new Database(databasePath)
  const insertUser = db.prepare(`
    INSERT INTO users
      (telegram_id, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, '2026-09-24 10:00:00', '2026-09-24 10:00:00')
  `)
  adminUserId = Number(
    insertUser.run(adminTelegramId, 'Admin', 'User', 'admin').lastInsertRowid,
  )
  studentUserId = Number(
    insertUser.run(studentTelegramId, 'Старое', 'Имя', 'student').lastInsertRowid,
  )
  db.prepare(`
    INSERT INTO user_roles (user_id, role, created_at)
    VALUES (?, 'admin', '2026-09-24 10:00:00'),
           (?, 'student', '2026-09-24 10:00:00')
  `).run(adminUserId, studentUserId)
  db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, created_at, updated_at)
    VALUES (?, 'Существующий Ученик', '+79990000000', 10, 'studying',
      '2026-09-24 10:00:00', '2026-09-24 10:00:00')
  `).run(studentUserId)
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    studentUserId,
    crypto.createHash('sha256').update(studentWebSession).digest('hex'),
  )
  db.close()

  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TG_WEBAPP_AUTH = 'strict'
  process.env.VK_APP_ID = '54558405'
  process.env.VK_APP_SECRET = vkSecret
  process.env.VK_ID_OFFSET = '10000000000'
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(UserNotificationGateway)
    .useValue({
      send: async (telegramId: number, message: string) => {
        sentNotifications.push({ telegramId, message })
      },
    })
    .compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('POST teacher-application создаёт guest identity и заменяет pending-заявку', async () => {
  const telegramId = 8801
  const first = await app.inject({
    method: 'POST',
    url: '/api/teacher-application',
    headers: {
      'x-telegram-init-data': buildTelegramInitData(telegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: telegramId,
      full_name: '  Павел   Первый  ',
      phone: ' +7 999 000 00 01 ',
    },
  })
  assert.equal(first.statusCode, 200)
  assert.deepEqual(first.json(), { ok: true })

  let db = new Database(databasePath, { readonly: true })
  const user = db.prepare(`
    SELECT id, telegram_id, first_name, last_name, role, vk_user_id
    FROM users WHERE telegram_id = ?
  `).get(telegramId) as {
    id: number
    telegram_id: number
    first_name: string
    last_name: string
    role: string
    vk_user_id: number | null
  }
  assert.deepEqual(user, {
    id: user.id,
    telegram_id: telegramId,
    first_name: 'Павел',
    last_name: 'Первый',
    role: 'guest',
    vk_user_id: null,
  })
  assert.deepEqual(db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ?
  `).all(user.id), [{ role: 'guest' }])
  const firstApplication = db.prepare(`
    SELECT id, full_name, phone, status
    FROM teacher_applications WHERE applicant_user_id = ?
  `).get(user.id) as { id: number; full_name: string; phone: string; status: string }
  assert.deepEqual(firstApplication, {
    id: firstApplication.id,
    full_name: 'Павел   Первый',
    phone: '+79990000001',
    status: 'pending',
  })
  db.close()

  const second = await app.inject({
    method: 'POST',
    url: '/api/teacher-application',
    headers: {
      'x-telegram-init-data': buildTelegramInitData(telegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: telegramId,
      full_name: 'Пётр Второй',
      phone: '89990000002',
    },
  })
  assert.equal(second.statusCode, 200)
  assert.deepEqual(second.json(), { ok: true })

  db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT first_name, last_name FROM users WHERE id = ?
  `).get(user.id), { first_name: 'Пётр', last_name: 'Второй' })
  const applications = db.prepare(`
    SELECT id, full_name, phone, status
    FROM teacher_applications WHERE applicant_user_id = ?
  `).all(user.id) as Array<{
    id: number
    full_name: string
    phone: string
    status: string
  }>
  assert.equal(applications.length, 1)
  assert.notEqual(applications[0]?.id, firstApplication.id)
  assert.deepEqual(applications[0], {
    id: applications[0]?.id,
    full_name: 'Пётр Второй',
    phone: '89990000002',
    status: 'pending',
  })
  const message = `Заявка на роль преподавателя (мини-апп):\nПётр Второй\nТелефон: 89990000002\nID в приложении: ${telegramId}`
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? AND kind = 'teacher_application'
    ORDER BY id DESC LIMIT 1
  `).get(adminUserId), {
    kind: 'teacher_application',
    body: message,
    payload: JSON.stringify({
      source: 'mini_app',
      telegram_id: telegramId,
      full_name: 'Пётр Второй',
      applicant_user_id: user.id,
    }),
  })
  const notificationCount = db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications
    WHERE user_id = ? AND kind = 'teacher_application'
  `).get(adminUserId) as { count: number }
  assert.equal(notificationCount.count, 2)
  db.close()
  assert.deepEqual(sentNotifications.slice(-2), [
    {
      telegramId: adminTelegramId,
      message: `Заявка на роль преподавателя (мини-апп):\nПавел   Первый\nТелефон: +79990000001\nID в приложении: ${telegramId}`,
    },
    { telegramId: adminTelegramId, message },
  ])
})

test('POST teacher-application поддерживает VK и nginx-путь', async () => {
  const vkUserId = 8802
  const claimedTelegramId = 10_000_000_000 + vkUserId
  const response = await app.inject({
    method: 'POST',
    url: '/teacher-application',
    headers: {
      'x-client-platform': 'vk',
      'x-vk-user-id': String(vkUserId),
      'x-app-user-id': String(claimedTelegramId),
      'x-vk-launch-params': buildVkLaunchParams(vkUserId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: claimedTelegramId,
      full_name: 'Виктор Кандидат',
      phone: '+79990000003',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT telegram_id, vk_user_id, first_name, last_name
    FROM users WHERE telegram_id = ?
  `).get(claimedTelegramId), {
    telegram_id: claimedTelegramId,
    vk_user_id: vkUserId,
    first_name: 'Виктор',
    last_name: 'Кандидат',
  })
  db.close()
})

test('POST teacher-application обновляет существующего пользователя через web-session', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/teacher-application',
    headers: {
      'x-web-session': studentWebSession,
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: studentTelegramId,
      full_name: 'Илья',
      phone: '+79990000004',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT first_name, last_name FROM users WHERE id = ?
  `).get(studentUserId), { first_name: 'Илья', last_name: 'Имя' })
  assert.deepEqual(db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ? ORDER BY role
  `).all(studentUserId), [{ role: 'student' }])
  assert.deepEqual(db.prepare(`
    SELECT full_name, phone, status FROM teacher_applications
    WHERE applicant_user_id = ?
  `).get(studentUserId), {
    full_name: 'Илья',
    phone: '+79990000004',
    status: 'pending',
  })
  db.close()
})

test('POST teacher-application сохраняет validation и auth ошибки', async (context) => {
  const valid = {
    telegram_id: 8803,
    full_name: 'Новый Кандидат',
    phone: '+79990000005',
  }
  const injectApplication = async (
    payload: Record<string, unknown>,
    signedTelegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/teacher-application',
    headers: {
      ...(signedTelegramId == null
        ? {}
        : { 'x-telegram-init-data': buildTelegramInitData(signedTelegramId) }),
      'content-type': 'application/json',
    },
    payload,
  })

  await context.test('schema проверяется до credential', async () => {
    for (const payload of [
      { ...valid, full_name: 'Я' },
      { ...valid, phone: '1234' },
      { ...valid, full_name: null },
    ]) {
      const response = await injectApplication(payload)
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), {
        ok: false,
        error: 'Некорректные параметры запроса.',
      })
    }
  })

  const invalidPhone = await injectApplication(
    { ...valid, phone: 'номер телефона' },
    valid.telegram_id,
  )
  assert.equal(invalidPhone.statusCode, 400)
  assert.deepEqual(invalidPhone.json(), {
    ok: false,
    error: 'Укажите корректный номер телефона.',
  })
  const emptyName = await injectApplication(
    { ...valid, full_name: '  ' },
    valid.telegram_id,
  )
  assert.deepEqual(emptyName.json(), { ok: false, error: 'Укажите ФИО.' })

  assert.equal((await injectApplication(valid)).statusCode, 401)
  assert.equal((await injectApplication(valid, 8804)).statusCode, 403)
})

test('POST students создаёт профиль, роли и уведомления атомарно', async () => {
  const telegramId = 8810
  const response = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: {
      'x-telegram-init-data': buildTelegramInitData(telegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: telegramId,
      full_name: '  Анна   Новая  ',
      phone: ' +7 999 100 20 30 ',
      lessons_count: '12,0',
      username: 'anna_new',
      first_name: 'Не используется',
      last_name: 'Тоже не используется',
      metro: '  Тверская  ',
    },
  })
  assert.equal(response.statusCode, 201)
  const body = response.json()
  const studentId = body.data.student.id
  assert.deepEqual(body, {
    ok: true,
    data: {
      student: {
        id: studentId,
        full_name: 'Анна   Новая',
        phone: '+79991002030',
        lessons_count: 12,
        status: 'moderation',
      },
      role: 'student',
      roles: ['guest', 'student'],
    },
  })

  const db = new Database(databasePath, { readonly: true })
  const user = db.prepare(`
    SELECT id, username, first_name, last_name, role FROM users WHERE telegram_id = ?
  `).get(telegramId) as {
    id: number
    username: string
    first_name: string
    last_name: string
    role: string
  }
  assert.deepEqual(user, {
    id: user.id,
    username: 'anna_new',
    first_name: 'Анна',
    last_name: 'Новая',
    role: 'guest',
  })
  assert.deepEqual(db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ? ORDER BY role
  `).all(user.id), [{ role: 'guest' }, { role: 'student' }])
  assert.deepEqual(db.prepare(`
    SELECT id, full_name, phone, lessons_count, status, metro
    FROM students WHERE user_id = ?
  `).get(user.id), {
    id: studentId,
    full_name: 'Анна   Новая',
    phone: '+79991002030',
    lessons_count: 12,
    status: 'moderation',
    metro: 'Тверская',
  })
  const message = `Новый ученик из мини-аппа:\nАнна   Новая\nТелефон: +79991002030\nМетро: Тверская\nЗанятий: 12\n\nID в Telegram: ${telegramId}`
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? AND kind = 'new_student'
  `).get(adminUserId), {
    kind: 'new_student',
    body: message,
    payload: JSON.stringify({
      source: 'mini_app',
      telegram_id: telegramId,
      full_name: 'Анна   Новая',
    }),
  })
  db.close()
  assert.deepEqual(sentNotifications.at(-1), { telegramId: adminTelegramId, message })

  const duplicate = await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: {
      'x-telegram-init-data': buildTelegramInitData(telegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: telegramId,
      full_name: 'Анна Новая',
      phone: '+79991002030',
      lessons_count: 12,
    },
  })
  assert.equal(duplicate.statusCode, 409)
  assert.equal(duplicate.json().error, 'Заявка уже существует.')
  assert.equal(duplicate.json().data.student.id, studentId)
})

test('POST students поддерживает VK identity и nginx-путь', async () => {
  const vkUserId = 8811
  const claimedTelegramId = 10_000_000_000 + vkUserId
  const response = await app.inject({
    method: 'POST',
    url: '/students',
    headers: {
      'x-client-platform': 'vk',
      'x-vk-user-id': String(vkUserId),
      'x-app-user-id': String(claimedTelegramId),
      'x-vk-launch-params': buildVkLaunchParams(vkUserId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: claimedTelegramId,
      full_name: 'Виктор Ученик',
      phone: '+79991002032',
      lessons_count: 8,
    },
  })
  assert.equal(response.statusCode, 201)
  const db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT telegram_id, vk_user_id, first_name, last_name
    FROM users WHERE telegram_id = ?
  `).get(claimedTelegramId), {
    telegram_id: claimedTelegramId,
    vk_user_id: vkUserId,
    first_name: 'Виктор',
    last_name: 'Ученик',
  })
  db.close()
})

test('POST students сохраняет validation и auth ошибки', async () => {
  const valid = {
    telegram_id: 8812,
    full_name: 'Новый Ученик',
    phone: '+79991002033',
    lessons_count: 10,
  }
  const injectStudent = async (
    payload: Record<string, unknown>,
    signedTelegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/students',
    headers: {
      ...(signedTelegramId == null
        ? {}
        : { 'x-telegram-init-data': buildTelegramInitData(signedTelegramId) }),
      'content-type': 'application/json',
    },
    payload,
  })

  for (const payload of [
    { ...valid, full_name: null },
    { ...valid, lessons_count: null },
    { ...valid, phone: 79991002033 },
  ]) {
    const result = await injectStudent(payload)
    assert.equal(result.statusCode, 400)
    assert.deepEqual(result.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  }
  assert.equal((await injectStudent(valid)).statusCode, 401)
  assert.equal((await injectStudent(valid, 8813)).statusCode, 403)

  for (const [patch, error] of [
    [{ full_name: '   ', phone: 'invalid', lessons_count: 0 }, 'Укажите ФИО ученика.'],
    [{ phone: 'invalid', lessons_count: 0 }, 'Укажите корректный номер телефона.'],
    [{ lessons_count: '2.5' }, 'Количество занятий должно быть целым числом больше нуля.'],
  ] as const) {
    const result = await injectStudent({ ...valid, ...patch }, valid.telegram_id)
    assert.equal(result.statusCode, 400)
    assert.deepEqual(result.json(), { ok: false, error })
  }
})

test('POST student/feedback сохраняет отзыв через web-session идемпотентно', async () => {
  const requestKey = '33333333-3333-4333-8333-333333333333'
  const payload = {
    telegram_id: studentTelegramId,
    subject: 'academy',
    message: '  Полезный отзыв  ',
    request_key: requestKey,
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/student/feedback',
      headers: {
        'x-web-session': studentWebSession,
        'content-type': 'application/json',
      },
      payload,
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { ok: true })
  }
  const db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT request_key, subject, message FROM private_feedback
    WHERE student_id = (SELECT id FROM students WHERE user_id = ?)
      AND request_key = ?
  `).get(studentUserId, requestKey), {
    request_key: requestKey,
    subject: 'academy',
    message: 'Полезный отзыв',
  })
  assert.deepEqual(db.prepare(`
    SELECT COUNT(*) AS count FROM private_feedback WHERE request_key = ?
  `).get(requestKey), { count: 1 })
  db.close()
})

test('POST student/feedback сохраняет validation, auth и student-доступ', async () => {
  const valid = {
    telegram_id: studentTelegramId,
    subject: 'teacher',
    message: 'Отзыв',
    request_key: '44444444-4444-4444-8444-444444444444',
  }
  const injectFeedback = async (
    payload: Record<string, unknown>,
    signedTelegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/student/feedback',
    headers: {
      ...(signedTelegramId == null
        ? {}
        : { 'x-telegram-init-data': buildTelegramInitData(signedTelegramId) }),
      'content-type': 'application/json',
    },
    payload,
  })
  for (const payload of [
    { ...valid, subject: 'unknown' },
    { ...valid, message: '   ' },
    { ...valid, message: 'x'.repeat(4001) },
    { ...valid, request_key: 'not-a-uuid' },
  ]) {
    const response = await injectFeedback(payload)
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  }
  assert.equal((await injectFeedback(valid)).statusCode, 401)
  assert.equal((await injectFeedback(valid, adminTelegramId)).statusCode, 403)

  const forbidden = await injectFeedback({
    ...valid,
    telegram_id: adminTelegramId,
  }, adminTelegramId)
  assert.equal(forbidden.statusCode, 403)
  assert.deepEqual(forbidden.json(), {
    ok: false,
    error: 'Обратная связь доступна только ученику.',
  })
})
