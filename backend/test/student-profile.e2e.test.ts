import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { UserNotificationGateway } from '../src/notifications/user-notification.gateway.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const botToken = '123456:nest-student-profile-token'
const webSessionToken = 'nest-student-profile-web-session'
const teacherWebSessionToken = 'nest-teacher-profile-web-session'
const adminWebSessionToken = 'nest-admin-profile-web-session'
const studentTelegramId = 7101
const otherStudentTelegramId = 7102
const teacherTelegramId = 7201
const adminTelegramId = 7301

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
const deliveredNotifications: { telegramId: number; message: string }[] = []

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
  const adminUserId = Number(
    insertUser.run(adminTelegramId, 'Admin', 'admin').lastInsertRowid,
  )
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
  insertRole.run(studentUserId, 'student')
  insertRole.run(otherStudentUserId, 'student')
  insertRole.run(teacherUserId, 'teacher')
  insertRole.run(adminUserId, 'admin')

  const insertStudent = db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, about_me, updated_at)
    VALUES (?, ?, '+70000000000', 1, 'studying', ?, '2020-01-01 00:00:00')
  `)
  insertStudent.run(studentUserId, 'Student Profile', 'Исходное описание')
  insertStudent.run(otherStudentUserId, 'Other Student', 'Чужое описание')
  db.prepare(`
    INSERT INTO teachers (user_id, full_name, about_me, updated_at)
    VALUES (?, 'Teacher', 'Исходное описание преподавателя', '2020-01-01 00:00:00')
  `).run(teacherUserId)
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(studentUserId, crypto.createHash('sha256').update(webSessionToken).digest('hex'))
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    teacherUserId,
    crypto.createHash('sha256').update(teacherWebSessionToken).digest('hex'),
  )
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    adminUserId,
    crypto.createHash('sha256').update(adminWebSessionToken).digest('hex'),
  )
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

const readTeacher = (telegramId: number): { about_me: string | null; updated_at: string } => {
  const db = new Database(databasePath, { readonly: true })
  const row = db.prepare(`
    SELECT t.about_me, t.updated_at
    FROM teachers t
    JOIN users u ON u.id = t.user_id
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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(UserNotificationGateway)
    .useValue({
      send: async (telegramId: number, message: string): Promise<void> => {
        deliveredNotifications.push({ telegramId, message })
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

test('POST /api/teacher/about сохраняет trimmed-описание через Prisma', async () => {
  const studentAboutBefore = readStudent(studentTelegramId).about_me
  const response = await app.inject({
    method: 'POST',
    url: '/api/teacher/about',
    headers: authHeaders(teacherTelegramId),
    payload: { telegram_id: teacherTelegramId, about_me: '  Новое описание преподавателя  ' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  const teacher = readTeacher(teacherTelegramId)
  assert.equal(teacher.about_me, 'Новое описание преподавателя')
  assert.notEqual(teacher.updated_at, '2020-01-01 00:00:00')
  assert.equal(readStudent(studentTelegramId).about_me, studentAboutBefore)
})

test('POST /api/teacher/about сохраняет пустое описание как NULL', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/teacher/about',
    headers: authHeaders(teacherTelegramId),
    payload: { telegram_id: teacherTelegramId, about_me: '   ' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.equal(readTeacher(teacherTelegramId).about_me, null)
})

test('изменение описания преподавателя поддерживает web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/teacher/about',
    headers: { 'x-web-session': teacherWebSessionToken },
    payload: { telegram_id: teacherTelegramId, about_me: 'Через web-session' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.equal(readTeacher(teacherTelegramId).about_me, 'Через web-session')
})

test('изменение описания преподавателя сохраняет validation и порядок auth ошибок', async (context) => {
  await context.test('about_me отсутствует', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/teacher/about',
      headers: authHeaders(teacherTelegramId),
      payload: { telegram_id: teacherTelegramId },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('about_me длиннее 1000 символов', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/teacher/about',
      headers: authHeaders(teacherTelegramId),
      payload: { telegram_id: teacherTelegramId, about_me: 'x'.repeat(1001) },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('validation выполняется до проверки credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/teacher/about',
      payload: { telegram_id: teacherTelegramId },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/teacher/about',
      payload: { telegram_id: teacherTelegramId, about_me: 'Описание' },
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/teacher/about',
      headers: authHeaders(studentTelegramId),
      payload: { telegram_id: teacherTelegramId, about_me: 'Описание' },
    })
    assert.equal(response.statusCode, 403)
  })
})

test('teacher/about одинаково отклоняет unknown и non-teacher пользователей', async () => {
  for (const telegramId of [9999, studentTelegramId]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/teacher/about',
      headers: authHeaders(telegramId),
      payload: { telegram_id: telegramId, about_me: 'Описание' },
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Только преподаватель может изменить раздел «Обо мне».',
    })
  }
})

test('POST /api/student/profile-edit создаёт заявку, аудит и оба уведомления', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/student/profile-edit',
    headers: authHeaders(studentTelegramId),
    payload: {
      telegram_id: studentTelegramId,
      full_name: '  Student Updated  ',
      phone: ' 12345 ',
      metro: '',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  const edit = db.prepare(`
    SELECT spe.student_id, spe.new_full_name, spe.new_phone, spe.new_metro, spe.status
    FROM student_profile_edits spe
    JOIN students s ON s.id = spe.student_id
    JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ?
    ORDER BY spe.id DESC LIMIT 1
  `).get(studentTelegramId)
  const student = db.prepare(`
    SELECT s.id, s.full_name, s.phone, s.metro
    FROM students s JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ?
  `).get(studentTelegramId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notification = db.prepare(`
    SELECT n.kind, n.body, n.payload
    FROM app_notifications n
    JOIN users u ON u.id = n.user_id
    WHERE u.telegram_id = ? AND n.kind = 'profile_edit_pending'
    ORDER BY n.id DESC LIMIT 1
  `).get(adminTelegramId)
  db.close()

  const { id: studentId, ...studentProfile } = student as {
    id: number
    full_name: string
    phone: string
    metro: string | null
  }

  assert.deepEqual(edit, {
    student_id: studentId,
    new_full_name: '  Student Updated  ',
    new_phone: ' 12345 ',
    new_metro: null,
    status: 'pending',
  })
  assert.deepEqual(studentProfile, {
    full_name: 'Student Profile',
    phone: '+70000000000',
    metro: null,
  })
  assert.deepEqual(audit, {
    action: 'student_profile_edit_submitted',
    meta: JSON.stringify({ student_id: studentId }),
  })
  const message = 'Ученик Student Profile отправил заявку на изменение профиля.'
  assert.deepEqual(notification, {
    kind: 'profile_edit_pending',
    body: message,
    payload: JSON.stringify({ student_id: studentId }),
  })
  assert.deepEqual(deliveredNotifications, [{ telegramId: adminTelegramId, message }])
})

test('повторная profile-edit заявка отклоняет предыдущую и поддерживает web-session', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/student/profile-edit',
    headers: { 'x-web-session': webSessionToken },
    payload: {
      telegram_id: studentTelegramId,
      full_name: 'Student Latest',
      phone: '+70000000001',
      metro: 'Central',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  const edits = db.prepare(`
    SELECT spe.new_full_name, spe.status
    FROM student_profile_edits spe
    JOIN students s ON s.id = spe.student_id
    JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ?
    ORDER BY spe.id ASC
  `).all(studentTelegramId)
  db.close()
  assert.deepEqual(edits, [
    { new_full_name: '  Student Updated  ', status: 'rejected' },
    { new_full_name: 'Student Latest', status: 'pending' },
  ])
})

test('profile-edit доступен completed и запрещён в другом статусе', async () => {
  const completedDb = new Database(databasePath)
  completedDb.prepare(`
    UPDATE students SET status = 'completed'
    WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
  `).run(otherStudentTelegramId)
  completedDb.close()
  const completed = await app.inject({
    method: 'POST',
    url: '/api/student/profile-edit',
    headers: authHeaders(otherStudentTelegramId),
    payload: {
      telegram_id: otherStudentTelegramId,
      full_name: 'Completed Student',
      phone: '+70000000002',
    },
  })
  assert.equal(completed.statusCode, 200)
  assert.deepEqual(completed.json(), { ok: true })

  const moderationDb = new Database(databasePath)
  moderationDb.prepare(`
    UPDATE students SET status = 'moderation'
    WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
  `).run(otherStudentTelegramId)
  moderationDb.close()
  const moderation = await app.inject({
    method: 'POST',
    url: '/api/student/profile-edit',
    headers: authHeaders(otherStudentTelegramId),
    payload: {
      telegram_id: otherStudentTelegramId,
      full_name: 'Moderation Student',
      phone: '+70000000003',
    },
  })
  assert.equal(moderation.statusCode, 403)
  assert.deepEqual(moderation.json(), {
    ok: false,
    error: 'Редактирование профиля недоступно в текущем статусе.',
  })

  const restoreDb = new Database(databasePath)
  restoreDb.prepare(`
    UPDATE students SET status = 'studying'
    WHERE user_id = (SELECT id FROM users WHERE telegram_id = ?)
  `).run(otherStudentTelegramId)
  restoreDb.close()
})

test('profile-edit сохраняет validation, auth и role ошибки', async (context) => {
  const validBody = {
    telegram_id: studentTelegramId,
    full_name: 'Student Profile',
    phone: '+70000000000',
  }
  for (const [name, bodyPatch] of [
    ['короткое имя', { full_name: 'S' }],
    ['короткий телефон', { phone: '1234' }],
    ['длинное метро', { metro: 'x'.repeat(81) }],
  ] as const) {
    await context.test(name, async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/student/profile-edit',
        headers: authHeaders(studentTelegramId),
        payload: { ...validBody, ...bodyPatch },
      })
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
    })
  }

  await context.test('validation выполняется до credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/profile-edit',
      payload: { ...validBody, full_name: 'S' },
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/profile-edit',
      payload: validBody,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/profile-edit',
      headers: authHeaders(otherStudentTelegramId),
      payload: validBody,
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('пользователь не найден', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/profile-edit',
      headers: authHeaders(unknownTelegramId),
      payload: { ...validBody, telegram_id: unknownTelegramId },
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не ученик', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/profile-edit',
      headers: authHeaders(teacherTelegramId),
      payload: { ...validBody, telegram_id: teacherTelegramId },
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Только ученики могут редактировать профиль.',
    })
  })
})

test('GET /api/admin/profile-edits возвращает только pending-заявки от новых к старым', async () => {
  const setupDb = new Database(databasePath)
  setupDb.prepare(`
    UPDATE student_profile_edits SET created_at = '2026-09-23 12:00:00'
    WHERE student_id = (SELECT s.id FROM students s JOIN users u ON u.id = s.user_id WHERE u.telegram_id = ?)
      AND status = 'pending'
  `).run(studentTelegramId)
  setupDb.prepare(`
    UPDATE student_profile_edits SET created_at = '2026-09-23 13:00:00'
    WHERE student_id = (SELECT s.id FROM students s JOIN users u ON u.id = s.user_id WHERE u.telegram_id = ?)
      AND status = 'pending'
  `).run(otherStudentTelegramId)
  const pending = setupDb.prepare(`
    SELECT id, student_id FROM student_profile_edits
    WHERE status = 'pending' ORDER BY created_at DESC
  `).all() as { id: number; student_id: number }[]
  setupDb.close()

  const response = await app.inject({
    method: 'GET',
    url: `/api/admin/profile-edits?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    data: {
      edits: [
        {
          id: pending[0]?.id,
          student_id: pending[0]?.student_id,
          new_full_name: 'Completed Student',
          new_phone: '+70000000002',
          new_metro: null,
          created_at: '2026-09-23 13:00:00',
          current_full_name: 'Other Student',
          current_phone: '+70000000000',
          current_metro: null,
          telegram_id: otherStudentTelegramId,
        },
        {
          id: pending[1]?.id,
          student_id: pending[1]?.student_id,
          new_full_name: 'Student Latest',
          new_phone: '+70000000001',
          new_metro: 'Central',
          created_at: '2026-09-23 12:00:00',
          current_full_name: 'Student Profile',
          current_phone: '+70000000000',
          current_metro: null,
          telegram_id: studentTelegramId,
        },
      ],
    },
  })
})

test('admin/profile-edits поддерживает web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/admin/profile-edits?telegram_id=${adminTelegramId}`,
    headers: { 'x-web-session': adminWebSessionToken },
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.edits.length, 2)
})

test('admin/profile-edits сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('нет telegram_id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/admin/profile-edits' })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/profile-edits?telegram_id=${adminTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/profile-edits?telegram_id=${adminTelegramId}`,
      headers: authHeaders(studentTelegramId),
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('пользователь не найден', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/profile-edits?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не администратор', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/profile-edits?telegram_id=${studentTelegramId}`,
      headers: authHeaders(studentTelegramId),
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Доступ только для администраторов.',
    })
  })
})

test('POST /api/admin/profile-edits/:id одобряет заявку и обновляет профиль атомарно', async () => {
  const setupDb = new Database(databasePath, { readonly: true })
  const edit = setupDb.prepare(`
    SELECT spe.id
    FROM student_profile_edits spe
    JOIN students s ON s.id = spe.student_id
    JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ? AND spe.status = 'pending'
  `).get(otherStudentTelegramId) as { id: number }
  setupDb.close()
  const deliveriesBefore = deliveredNotifications.length

  const response = await app.inject({
    method: 'POST',
    url: `/api/admin/profile-edits/${edit.id}`,
    headers: authHeaders(adminTelegramId),
    payload: { telegram_id: adminTelegramId, action: 'approve' },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  const storedEdit = db.prepare(`
    SELECT status, admin_comment, reviewed_at, reviewed_by_telegram_id
    FROM student_profile_edits WHERE id = ?
  `).get(edit.id) as {
    status: string
    admin_comment: string | null
    reviewed_at: string | null
    reviewed_by_telegram_id: number | null
  }
  const student = db.prepare(`
    SELECT s.full_name, s.phone, s.metro
    FROM students s JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ?
  `).get(otherStudentTelegramId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notification = db.prepare(`
    SELECT id FROM app_notifications WHERE kind = 'profile_edit_approved'
  `).get()
  db.close()

  assert.equal(storedEdit.status, 'approved')
  assert.equal(storedEdit.admin_comment, null)
  assert.ok(storedEdit.reviewed_at)
  assert.equal(storedEdit.reviewed_by_telegram_id, adminTelegramId)
  assert.deepEqual(student, {
    full_name: 'Completed Student',
    phone: '+70000000002',
    metro: null,
  })
  assert.deepEqual(audit, {
    action: 'profile_edit_approved',
    meta: JSON.stringify({ edit_id: edit.id }),
  })
  assert.equal(notification, undefined)
  assert.equal(deliveredNotifications.length, deliveriesBefore)
})

test('POST admin/profile-edits/:id отклоняет заявку через web-session и nginx-путь', async () => {
  const setupDb = new Database(databasePath, { readonly: true })
  const edit = setupDb.prepare(`
    SELECT spe.id
    FROM student_profile_edits spe
    JOIN students s ON s.id = spe.student_id
    JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ? AND spe.status = 'pending'
  `).get(studentTelegramId) as { id: number }
  setupDb.close()
  const deliveriesBefore = deliveredNotifications.length

  const response = await app.inject({
    method: 'POST',
    url: `/admin/profile-edits/${edit.id}`,
    headers: { 'x-web-session': adminWebSessionToken },
    payload: {
      telegram_id: adminTelegramId,
      action: 'reject',
      comment: 'Оставьте текущие данные',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  const storedEdit = db.prepare(`
    SELECT status, admin_comment, reviewed_at, reviewed_by_telegram_id
    FROM student_profile_edits WHERE id = ?
  `).get(edit.id) as {
    status: string
    admin_comment: string | null
    reviewed_at: string | null
    reviewed_by_telegram_id: number | null
  }
  const student = db.prepare(`
    SELECT s.full_name, s.phone, s.metro
    FROM students s JOIN users u ON u.id = s.user_id
    WHERE u.telegram_id = ?
  `).get(studentTelegramId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notification = db.prepare(`
    SELECT id FROM app_notifications WHERE kind = 'profile_edit_rejectd'
  `).get()
  db.close()

  assert.equal(storedEdit.status, 'rejected')
  assert.equal(storedEdit.admin_comment, 'Оставьте текущие данные')
  assert.ok(storedEdit.reviewed_at)
  assert.equal(storedEdit.reviewed_by_telegram_id, adminTelegramId)
  assert.deepEqual(student, {
    full_name: 'Student Profile',
    phone: '+70000000000',
    metro: null,
  })
  assert.deepEqual(audit, {
    action: 'profile_edit_rejectd',
    meta: JSON.stringify({ edit_id: edit.id }),
  })
  assert.equal(notification, undefined)
  assert.equal(deliveredNotifications.length, deliveriesBefore)
})

test('POST admin/profile-edits/:id сохраняет validation, auth и role ошибки', async (context) => {
  const validBody = { telegram_id: adminTelegramId, action: 'approve' }

  await context.test('validation выполняется до credential', async () => {
    const invalidCases: Array<{
      url: string
      payload: Record<string, unknown>
    }> = [
      { url: '/api/admin/profile-edits/nope', payload: validBody },
      {
        url: '/api/admin/profile-edits/1',
        payload: { telegram_id: adminTelegramId, action: 'archive' },
      },
      {
        url: '/api/admin/profile-edits/1',
        payload: { ...validBody, comment: 'x'.repeat(501) },
      },
    ]
    for (const { url, payload } of invalidCases) {
      const response = await app.inject({ method: 'POST', url, payload })
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), {
        ok: false,
        error: 'Некорректные параметры запроса.',
      })
    }
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/profile-edits/999999',
      payload: validBody,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/profile-edits/999999',
      headers: authHeaders(studentTelegramId),
      payload: validBody,
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('пользователь не найден', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/profile-edits/999999',
      headers: authHeaders(unknownTelegramId),
      payload: { telegram_id: unknownTelegramId, action: 'approve' },
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не администратор', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/profile-edits/999999',
      headers: authHeaders(studentTelegramId),
      payload: { telegram_id: studentTelegramId, action: 'approve' },
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Доступ только для администраторов.',
    })
  })

  await context.test('заявка отсутствует или уже обработана', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/profile-edits/999999',
      headers: authHeaders(adminTelegramId),
      payload: validBody,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Заявка не найдена или уже обработана.',
    })
  })
})
