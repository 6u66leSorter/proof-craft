import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import multipart from '@fastify/multipart'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { getMultipartOptions } from '../src/common/multipart-options.js'
import { createTestDatabase } from './support/test-database.js'

const botToken = '123456:nest-student-avatar-token'
const webSessionToken = 'nest-student-avatar-web-session'
const ownerTelegramId = 6101
const noAvatarTelegramId = 6102
const missingFileTelegramId = 6103
const teacherTelegramId = 6201
const adminTelegramId = 6301
const testImageSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'

type FixtureIds = {
  ownerStudent: number
  noAvatarStudent: number
  missingFileStudent: number
  ownerAvatarFile: string
}

let temporaryRoot: string
let app: NestFastifyApplication
let fixtureIds: FixtureIds

const seedStudentAvatars = (databasePath: string): FixtureIds => {
  const db = new Database(databasePath)
  const uploadsDirectory = join(dirname(databasePath), 'uploads')
  mkdirSync(uploadsDirectory, { recursive: true })
  const avatarFile = join(uploadsDirectory, 'owner-avatar.jpg')
  const missingAvatarFile = join(uploadsDirectory, 'missing-avatar.jpg')
  writeFileSync(avatarFile, 'owner avatar')

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, role)
    VALUES (?, ?, ?)
  `)
  const ownerUser = Number(insertUser.run(ownerTelegramId, 'Owner', 'student').lastInsertRowid)
  const noAvatarUser = Number(
    insertUser.run(noAvatarTelegramId, 'No avatar', 'student').lastInsertRowid,
  )
  const missingFileUser = Number(
    insertUser.run(missingFileTelegramId, 'Missing file', 'student').lastInsertRowid,
  )
  const teacherUser = Number(
    insertUser.run(teacherTelegramId, 'Teacher', 'teacher').lastInsertRowid,
  )
  const adminUser = Number(insertUser.run(adminTelegramId, 'Admin', 'admin').lastInsertRowid)

  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
  insertRole.run(ownerUser, 'student')
  insertRole.run(noAvatarUser, 'student')
  insertRole.run(missingFileUser, 'student')
  insertRole.run(teacherUser, 'teacher')
  insertRole.run(adminUser, 'admin')

  const insertStudent = db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status, avatar_file_id)
    VALUES (?, ?, '+70000000000', 1, ?, ?)
  `)
  const ownerStudent = Number(
    insertStudent.run(ownerUser, 'Owner Student', 'studying', avatarFile).lastInsertRowid,
  )
  const noAvatarStudent = Number(
    insertStudent.run(noAvatarUser, 'No Avatar Student', 'studying', null).lastInsertRowid,
  )
  const missingFileStudent = Number(
    insertStudent.run(missingFileUser, 'Completed Student', 'completed', missingAvatarFile)
      .lastInsertRowid,
  )
  const teacher = Number(
    db.prepare(`INSERT INTO teachers (user_id, full_name) VALUES (?, 'Teacher')`)
      .run(teacherUser).lastInsertRowid,
  )
  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
    .run(ownerStudent, teacher)

  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(ownerUser, crypto.createHash('sha256').update(webSessionToken).digest('hex'))
  db.close()
  return { ownerStudent, noAvatarStudent, missingFileStudent, ownerAvatarFile: avatarFile }
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `student-avatar-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Avatar' }),
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

const multipartFile = (
  content: string,
  filename = 'avatar.svg',
  contentType = 'image/svg+xml',
): { headers: Record<string, string>; payload: Buffer } => {
  const boundary = `proof-craft-${crypto.randomUUID()}`
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n` +
        content +
        `\r\n--${boundary}--\r\n`,
    ),
  }
}

const multipartWithoutFile = (): { headers: Record<string, string>; payload: Buffer } => {
  const boundary = `proof-craft-${crypto.randomUUID()}`
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="description"\r\n\r\n' +
        `no file\r\n--${boundary}--\r\n`,
    ),
  }
}

before(async () => {
  const fixture = await createTestDatabase('proof-craft-student-avatars-')
  temporaryRoot = fixture.temporaryRoot
  fixtureIds = seedStudentAvatars(fixture.databasePath)
  process.env.DATABASE_URL = `file:${fixture.databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TELEGRAM_BOT_TOKEN = ''
  process.env.VITE_TELEGRAM_BOT_TOKEN = ''
  process.env.TG_WEBAPP_AUTH = 'strict'
  process.env.MAX_HOMEWORK_UPLOAD_MB = '0.001'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.register(multipart, getMultipartOptions())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('GET /api/student/me/avatar отдаёт собственный аватар с private cache', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
    headers: authHeaders(ownerTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'image/jpeg')
  assert.equal(response.headers['cache-control'], 'private, max-age=3600')
  assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
  assert.equal(response.body, 'owner avatar')
})

test('собственный аватар поддерживает web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/student/me/avatar?telegram_id=${ownerTelegramId}`,
    headers: { 'x-web-session': webSessionToken },
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.body, 'owner avatar')
})

test('собственный аватар сохраняет validation, auth и not-found ошибки', async (context) => {
  await context.test('нет telegram_id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/student/me/avatar' })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(noAvatarTelegramId),
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('пользователь не найден', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'GET',
      url: `/api/student/me/avatar?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('у ученика нет аватара', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/student/me/avatar?telegram_id=${noAvatarTelegramId}`,
      headers: authHeaders(noAvatarTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Аватар не установлен.' })
  })

  await context.test('у пользователя нет student-профиля', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/student/me/avatar?telegram_id=${teacherTelegramId}`,
      headers: authHeaders(teacherTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Аватар не установлен.' })
  })

  await context.test('файл аватара отсутствует', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/student/me/avatar?telegram_id=${missingFileTelegramId}`,
      headers: authHeaders(missingFileTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Файл аватара не найден.' })
  })
})

test('владелец, назначенный преподаватель и администратор читают аватар ученика', async () => {
  for (const telegramId of [ownerTelegramId, teacherTelegramId, adminTelegramId]) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/${fixtureIds.ownerStudent}/avatar?telegram_id=${telegramId}`,
      headers: authHeaders(telegramId),
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'image/jpeg')
    assert.equal(response.headers['cache-control'], 'private, max-age=3600')
    assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
    assert.equal(response.body, 'owner avatar')
  }
})

test('ролевой аватар поддерживает web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/students/${fixtureIds.ownerStudent}/avatar?telegram_id=${ownerTelegramId}`,
    headers: { 'x-web-session': webSessionToken },
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.body, 'owner avatar')
})

test('посторонний ученик и неназначенный преподаватель не читают аватар', async () => {
  const student = await app.inject({
    method: 'GET',
    url: `/api/students/${fixtureIds.ownerStudent}/avatar?telegram_id=${noAvatarTelegramId}`,
    headers: authHeaders(noAvatarTelegramId),
  })
  assert.equal(student.statusCode, 403)
  assert.deepEqual(student.json(), { ok: false, error: 'Нет доступа к профилю ученика.' })

  const teacher = await app.inject({
    method: 'GET',
    url: `/api/students/${fixtureIds.noAvatarStudent}/avatar?telegram_id=${teacherTelegramId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(teacher.statusCode, 403)
  assert.deepEqual(teacher.json(), { ok: false, error: 'Нет доступа к профилю ученика.' })
})

test('ролевой аватар сохраняет validation, auth и порядок ошибок', async (context) => {
  await context.test('некорректный student_id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/nope/avatar?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(ownerTelegramId),
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет telegram_id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/${fixtureIds.ownerStudent}/avatar`,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/${fixtureIds.ownerStudent}/avatar?telegram_id=${ownerTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/${fixtureIds.ownerStudent}/avatar?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(noAvatarTelegramId),
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('подписанный неизвестный пользователь не получает доступ', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/${fixtureIds.ownerStudent}/avatar?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), { ok: false, error: 'Нет доступа к профилю ученика.' })
  })

  await context.test('у доступного ученика нет аватара', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/${fixtureIds.noAvatarStudent}/avatar?telegram_id=${adminTelegramId}`,
      headers: authHeaders(adminTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Аватар не установлен.' })
  })

  await context.test('администратор получает avatar-ошибку для отсутствующего профиля', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/999999/avatar?telegram_id=${adminTelegramId}`,
      headers: authHeaders(adminTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Аватар не установлен.' })
  })

  await context.test('файл аватара отсутствует', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/students/${fixtureIds.missingFileStudent}/avatar?telegram_id=${missingFileTelegramId}`,
      headers: authHeaders(missingFileTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Файл аватара не найден.' })
  })
})

test('загрузка аватара сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('нет telegram_id', async () => {
    const multipartBody = multipartWithoutFile()
    const response = await app.inject({
      method: 'POST',
      url: '/api/student/me/avatar',
      headers: multipartBody.headers,
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const multipartBody = multipartWithoutFile()
    const response = await app.inject({
      method: 'POST',
      url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
      headers: multipartBody.headers,
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const multipartBody = multipartWithoutFile()
    const response = await app.inject({
      method: 'POST',
      url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
      headers: { ...multipartBody.headers, ...authHeaders(noAvatarTelegramId) },
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('пользователь не найден', async () => {
    const unknownTelegramId = 9999
    const multipartBody = multipartWithoutFile()
    const response = await app.inject({
      method: 'POST',
      url: `/api/student/me/avatar?telegram_id=${unknownTelegramId}`,
      headers: { ...multipartBody.headers, ...authHeaders(unknownTelegramId) },
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не ученик', async () => {
    const multipartBody = multipartWithoutFile()
    const response = await app.inject({
      method: 'POST',
      url: `/api/student/me/avatar?telegram_id=${teacherTelegramId}`,
      headers: { ...multipartBody.headers, ...authHeaders(teacherTelegramId) },
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), { ok: false, error: 'Только ученики могут менять аватар.' })
  })
})

test('загрузка аватара различает отсутствие, размер и обработку файла', async (context) => {
  await context.test('файл не передан', async () => {
    const multipartBody = multipartWithoutFile()
    const response = await app.inject({
      method: 'POST',
      url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
      headers: { ...multipartBody.headers, ...authHeaders(ownerTelegramId) },
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Файл не получен.' })
  })

  await context.test('файл слишком большой', async () => {
    const multipartBody = multipartFile('x'.repeat(2_048), 'large.png', 'image/png')
    const response = await app.inject({
      method: 'POST',
      url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
      headers: { ...multipartBody.headers, ...authHeaders(ownerTelegramId) },
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Файл слишком большой.' })
  })

  await context.test('файл не является изображением', async () => {
    const multipartBody = multipartFile('not an image', 'broken.png', 'image/png')
    const response = await app.inject({
      method: 'POST',
      url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
      headers: { ...multipartBody.headers, ...authHeaders(ownerTelegramId) },
      payload: multipartBody.payload,
    })
    assert.equal(response.statusCode, 500)
    assert.deepEqual(response.json(), { ok: false, error: 'Ошибка обработки изображения.' })
  })

  assert.equal(existsSync(fixtureIds.ownerAvatarFile), true)
})

test('POST /api/student/me/avatar нормализует и безопасно заменяет аватар', async () => {
  const multipartBody = multipartFile(testImageSvg)
  const response = await app.inject({
    method: 'POST',
    url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
    headers: { ...multipartBody.headers, ...authHeaders(ownerTelegramId) },
    payload: multipartBody.payload,
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  assert.equal(existsSync(fixtureIds.ownerAvatarFile), false)

  const avatar = await app.inject({
    method: 'GET',
    url: `/api/student/me/avatar?telegram_id=${ownerTelegramId}`,
    headers: authHeaders(ownerTelegramId),
  })
  assert.equal(avatar.statusCode, 200)
  assert.deepEqual([...avatar.rawPayload.subarray(0, 2)], [0xff, 0xd8])
})

test('загрузка аватара поддерживает web-session и nginx-путь', async () => {
  const multipartBody = multipartFile(testImageSvg)
  const response = await app.inject({
    method: 'POST',
    url: `/student/me/avatar?telegram_id=${ownerTelegramId}`,
    headers: { ...multipartBody.headers, 'x-web-session': webSessionToken },
    payload: multipartBody.payload,
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
})
