import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test, { after, before } from 'node:test'
import multipart from '@fastify/multipart'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import Database from 'better-sqlite3'
import { AppModule } from '../src/app.module.js'
import { getMultipartOptions } from '../src/common/multipart-options.js'
import { UserNotificationGateway } from '../src/notifications/user-notification.gateway.js'
import { createTestDatabase } from './support/test-database.js'

const botToken = '123456:nest-submit-homework-token'
const studentTelegramId = 9701
const teacherTelegramId = 9702
const adminTelegramId = 9703
const moderationTelegramId = 9704
const unknownTelegramId = 9799
const webSession = 'nest-submit-homework-web-session'
const testImageSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'

type FixtureIds = {
  studentId: number
  teacherUserId: number
  adminUserId: number
}

const sentNotifications: Array<{ telegramId: number; message: string }> = []
const notificationGateway: UserNotificationGateway = {
  async send(telegramId: number, message: string): Promise<void> {
    sentNotifications.push({ telegramId, message })
  },
}

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
let fixtureIds: FixtureIds

const buildTelegramInitData = (telegramId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `submit-homework-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: 'Homework' }),
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

const multipartHomework = (
  fields: Record<string, string | number | boolean>,
  files: Array<{
    content: string
    filename: string
    contentType: string
    field?: string
  }> = [],
): { headers: Record<string, string>; payload: Buffer } => {
  const boundary = `proof-craft-${crypto.randomUUID()}`
  const chunks: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
  }
  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field ?? 'file'}"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n${file.content}\r\n`,
    ))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  }
}

const seed = (path: string): FixtureIds => {
  const db = new Database(path)
  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, ?, ?, ?)
  `)
  const studentUserId = Number(
    insertUser.run(studentTelegramId, 'Алиса', 'Ученица', 'student').lastInsertRowid,
  )
  const teacherUserId = Number(
    insertUser.run(teacherTelegramId, 'Ирина', 'Наставник', 'teacher').lastInsertRowid,
  )
  const adminUserId = Number(
    insertUser.run(adminTelegramId, 'Админ', 'Тестовый', 'admin').lastInsertRowid,
  )
  const moderationUserId = Number(
    insertUser.run(moderationTelegramId, 'Новая', 'Ученица', 'student').lastInsertRowid,
  )
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
  insertRole.run(studentUserId, 'student')
  insertRole.run(teacherUserId, 'teacher')
  insertRole.run(adminUserId, 'admin')
  insertRole.run(moderationUserId, 'student')

  const studentId = Number(db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status)
    VALUES (?, 'Алиса Ученица', '+79990009701', 3, 'studying')
  `).run(studentUserId).lastInsertRowid)
  db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status)
    VALUES (?, 'Новая Ученица', '+79990009704', 3, 'moderation')
  `).run(moderationUserId)
  const teacherId = Number(db.prepare(`
    INSERT INTO teachers (user_id, full_name) VALUES (?, 'Ирина Наставник')
  `).run(teacherUserId).lastInsertRowid)
  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
    .run(studentId, teacherId)
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(studentUserId, crypto.createHash('sha256').update(webSession).digest('hex'))
  db.close()
  return { studentId, teacherUserId, adminUserId }
}

before(async () => {
  const fixture = await createTestDatabase('proof-craft-submit-homework-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  fixtureIds = seed(databasePath)
  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TELEGRAM_BOT_TOKEN = ''
  process.env.VITE_TELEGRAM_BOT_TOKEN = ''
  process.env.TG_WEBAPP_AUTH = 'strict'
  process.env.MAX_HOMEWORK_UPLOAD_MB = '0.001'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(UserNotificationGateway)
    .useValue(notificationGateway)
    .compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.register(multipart, getMultipartOptions())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('POST homeworks создаёт текстовую работу и атомарные уведомления', async () => {
  const body = multipartHomework({
    telegram_id: studentTelegramId,
    lesson_number: 1,
    text_content: '  Текстовая работа  ',
    haircut_name: '  Фейд  ',
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/homeworks',
    headers: { ...body.headers, ...authHeaders(studentTelegramId) },
    payload: body.payload,
  })
  assert.equal(response.statusCode, 201)
  const homework = response.json().data.homework
  assert.equal(homework.lesson_number, 1)
  assert.equal(homework.is_bonus, false)
  assert.equal(homework.haircut_name, 'Фейд')
  assert.equal(homework.content_type, 'text')
  assert.equal(homework.text_content, 'Текстовая работа')
  assert.equal(homework.status, 'pending')
  assert.deepEqual(homework.attachments, [])

  const expectedBody = 'Ученик Алиса Ученица отправил ДЗ по урок №1 («Фейд»).'
  const expectedPayload = JSON.stringify({
    student_id: fixtureIds.studentId,
    homework_id: homework.id,
  })
  const db = new Database(databasePath, { readonly: true })
  const notifications = db.prepare(`
    SELECT user_id, kind, body, payload FROM app_notifications
    WHERE payload = ? ORDER BY user_id
  `).all(expectedPayload)
  db.close()
  assert.deepEqual(notifications, [
    { user_id: fixtureIds.teacherUserId, kind: 'new_homework', body: expectedBody, payload: expectedPayload },
    { user_id: fixtureIds.adminUserId, kind: 'new_homework', body: expectedBody, payload: expectedPayload },
  ].sort((left, right) => left.user_id - right.user_id))
  assert.deepEqual(sentNotifications, [
    { telegramId: teacherTelegramId, message: expectedBody },
    { telegramId: adminTelegramId, message: expectedBody },
  ])
})

test('POST homeworks сохраняет серию фото и поддерживает web-session/nginx-путь', async () => {
  const body = multipartHomework(
    {
      telegram_id: studentTelegramId,
      lesson_number: 2,
      text_content: 'Фото работы',
    },
    [
      { field: 'files', content: testImageSvg, filename: '../../first.svg', contentType: 'image/svg+xml' },
      { field: 'files', content: testImageSvg, filename: 'second.svg', contentType: 'image/svg+xml' },
      { field: 'ignored', content: 'ignored', filename: 'ignored.txt', contentType: 'text/plain' },
    ],
  )
  const response = await app.inject({
    method: 'POST',
    url: '/homeworks',
    headers: { ...body.headers, 'x-web-session': webSession },
    payload: body.payload,
  })
  assert.equal(response.statusCode, 201)
  const homework = response.json().data.homework
  assert.equal(homework.content_type, 'photo')
  assert.equal(homework.has_local_file, true)
  assert.equal(homework.has_telegram_file, false)
  assert.equal(homework.extra_files_count, 1)
  assert.deepEqual(homework.attachments.map((file: { content_type: string }) => file.content_type), ['photo'])

  const db = new Database(databasePath, { readonly: true })
  const files = db.prepare(`
    SELECT file_id, 0 AS sort_order FROM homeworks WHERE id = ?
    UNION ALL
    SELECT file_id, sort_order FROM homework_files WHERE homework_id = ?
    ORDER BY sort_order
  `).all(homework.id, homework.id) as Array<{ file_id: string; sort_order: number }>
  db.close()
  assert.deepEqual(files.map(({ sort_order }) => sort_order), [0, 1])
  assert.ok(files.every(({ file_id }) => existsSync(file_id) && file_id.endsWith('.jpg')))
})

test('POST homeworks отклоняет duplicate и очищает загруженный файл', async () => {
  const uploads = join(dirname(databasePath), 'uploads')
  const beforeFiles = readdirSync(uploads).sort()
  const body = multipartHomework(
    { telegram_id: studentTelegramId, lesson_number: 1 },
    [{ content: 'duplicate', filename: 'duplicate.txt', contentType: 'text/plain' }],
  )
  const response = await app.inject({
    method: 'POST',
    url: '/api/homeworks',
    headers: { ...body.headers, ...authHeaders(studentTelegramId) },
    payload: body.payload,
  })
  assert.equal(response.statusCode, 409)
  assert.deepEqual(response.json(), {
    ok: false,
    error: 'По этому уроку или бонусу уже есть работа на проверке. Дождитесь проверки преподавателя.',
  })
  assert.deepEqual(readdirSync(uploads).sort(), beforeFiles)
})

test('POST homeworks валидирует серию и очищает finalized-файлы', async () => {
  const uploads = join(dirname(databasePath), 'uploads')
  const beforeFiles = readdirSync(uploads).sort()
  const body = multipartHomework(
    { telegram_id: studentTelegramId, lesson_number: 3 },
    [
      { content: testImageSvg, filename: 'photo.svg', contentType: 'image/svg+xml' },
      { content: 'document', filename: 'document.txt', contentType: 'text/plain' },
    ],
  )
  const response = await app.inject({
    method: 'POST',
    url: '/api/homeworks',
    headers: { ...body.headers, ...authHeaders(studentTelegramId) },
    payload: body.payload,
  })
  assert.equal(response.statusCode, 400)
  assert.deepEqual(response.json(), {
    ok: false,
    error: 'Несколько файлов за раз можно прикрепить только для фото. Видео или документ отправьте одним файлом (или добавьте текст к серии фото).',
  })
  assert.deepEqual(readdirSync(uploads).sort(), beforeFiles)
})

test('POST homeworks сохраняет lesson, status и empty ошибки', async (context) => {
  await context.test('урок за пределами программы', async () => {
    const body = multipartHomework({
      telegram_id: studentTelegramId,
      lesson_number: 4,
      text_content: 'Недоступно',
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/homeworks',
      headers: { ...body.headers, ...authHeaders(studentTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Урок №4 недоступен. По вашей программе 3 уроков.',
    })
  })

  await context.test('пустая бонусная работа', async () => {
    const body = multipartHomework({
      telegram_id: studentTelegramId,
      is_bonus: true,
      text_content: '   ',
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/homeworks',
      headers: { ...body.headers, ...authHeaders(studentTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Добавьте файл или текстовое описание работы.',
    })
  })

  await context.test('ученик не в статусе studying', async () => {
    const body = multipartHomework({
      telegram_id: moderationTelegramId,
      lesson_number: 1,
      text_content: 'Рано',
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/homeworks',
      headers: { ...body.headers, ...authHeaders(moderationTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Сдача работ доступна только ученикам в статусе "обучается".',
    })
  })
})

test('POST homeworks очищает staged-файлы при auth, unknown и upload ошибках', async (context) => {
  const uploads = join(dirname(databasePath), 'uploads')
  const assertNoNewFiles = (beforeFiles: string[]): void => {
    assert.deepEqual(readdirSync(uploads).sort(), beforeFiles)
  }

  await context.test('credential mismatch', async () => {
    const beforeFiles = readdirSync(uploads).sort()
    const body = multipartHomework(
      { telegram_id: studentTelegramId, lesson_number: 3 },
      [{ content: 'file', filename: 'auth.txt', contentType: 'text/plain' }],
    )
    const response = await app.inject({
      method: 'POST',
      url: '/api/homeworks',
      headers: { ...body.headers, ...authHeaders(moderationTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 403)
    assertNoNewFiles(beforeFiles)
  })

  await context.test('подписанный неизвестный пользователь', async () => {
    const beforeFiles = readdirSync(uploads).sort()
    const body = multipartHomework(
      { telegram_id: unknownTelegramId, lesson_number: 1 },
      [{ content: 'file', filename: 'unknown.txt', contentType: 'text/plain' }],
    )
    const response = await app.inject({
      method: 'POST',
      url: '/api/homeworks',
      headers: { ...body.headers, ...authHeaders(unknownTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Ученик не найден. Отправьте /start боту.',
    })
    assertNoNewFiles(beforeFiles)
  })

  await context.test('слишком большой файл', async () => {
    const beforeFiles = readdirSync(uploads).sort()
    const body = multipartHomework(
      { telegram_id: studentTelegramId, lesson_number: 3 },
      [{ content: 'x'.repeat(2_048), filename: 'large.txt', contentType: 'text/plain' }],
    )
    const response = await app.inject({
      method: 'POST',
      url: '/api/homeworks',
      headers: { ...body.headers, ...authHeaders(studentTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 413)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Файл слишком большой. Максимум 0 МБ.',
    })
    assertNoNewFiles(beforeFiles)
  })
})
