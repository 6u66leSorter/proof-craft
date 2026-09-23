import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const botToken = '123456:nest-homework-file-token'
const webSessionToken = 'nest-homework-file-web-session'
const ownerTelegramId = 9101
const outsiderTelegramId = 9102
const teacherTelegramId = 9201
const adminTelegramId = 9301
const testImageSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'

type FixtureIds = {
  ownerHomework: number
  missingFileHomework: number
  outsiderHomework: number
}

let temporaryRoot: string
let app: NestFastifyApplication
let fixtureIds: FixtureIds

const seedHomeworkFiles = (databasePath: string): FixtureIds => {
  const db = new Database(databasePath)
  const uploadsDirectory = join(dirname(databasePath), 'uploads')
  mkdirSync(uploadsDirectory, { recursive: true })
  const ownerFile = join(uploadsDirectory, 'owner-homework.svg')
  const outsiderFile = join(uploadsDirectory, 'outsider-homework.txt')
  writeFileSync(ownerFile, testImageSvg)
  writeFileSync(outsiderFile, 'outsider homework')

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, role)
    VALUES (?, ?, ?)
  `)
  const ownerUser = Number(insertUser.run(ownerTelegramId, 'Owner', 'student').lastInsertRowid)
  const outsiderUser = Number(insertUser.run(outsiderTelegramId, 'Outsider', 'student').lastInsertRowid)
  const teacherUser = Number(insertUser.run(teacherTelegramId, 'Teacher', 'teacher').lastInsertRowid)
  const adminUser = Number(insertUser.run(adminTelegramId, 'Admin', 'admin').lastInsertRowid)
  const insertRole = db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, ?)`)
  insertRole.run(ownerUser, 'student')
  insertRole.run(outsiderUser, 'student')
  insertRole.run(teacherUser, 'teacher')
  insertRole.run(adminUser, 'admin')

  const insertStudent = db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status)
    VALUES (?, ?, '+70000000000', 1, 'studying')
  `)
  const ownerStudent = Number(insertStudent.run(ownerUser, 'Owner Student').lastInsertRowid)
  const outsiderStudent = Number(insertStudent.run(outsiderUser, 'Outsider Student').lastInsertRowid)
  const teacher = Number(
    db.prepare(`INSERT INTO teachers (user_id, full_name) VALUES (?, 'Assigned Teacher')`)
      .run(teacherUser).lastInsertRowid,
  )
  db.prepare(`INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)`)
    .run(ownerStudent, teacher)

  const insertHomework = db.prepare(`
    INSERT INTO homeworks (student_id, lesson_number, content_type, file_id, status)
    VALUES (?, ?, ?, ?, 'pending')
  `)
  const ownerHomework = Number(
    insertHomework.run(ownerStudent, 1, 'photo', ownerFile).lastInsertRowid,
  )
  db.prepare(`UPDATE homeworks SET revision_student_file_id = ? WHERE id = ?`)
    .run(ownerFile, ownerHomework)
  const missingFileHomework = Number(
    insertHomework.run(ownerStudent, 2, 'text', null).lastInsertRowid,
  )
  const outsiderHomework = Number(
    insertHomework.run(outsiderStudent, 1, 'document', outsiderFile).lastInsertRowid,
  )

  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(ownerUser, crypto.createHash('sha256').update(webSessionToken).digest('hex'))
  db.close()
  return { ownerHomework, missingFileHomework, outsiderHomework }
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `homework-file-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'File' }),
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

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-homework-files-')
  temporaryRoot = fixture.temporaryRoot
  fixtureIds = seedHomeworkFiles(fixture.databasePath)
  process.env.DATABASE_URL = `file:${fixture.databasePath}`
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

test('владелец, назначенный преподаватель и администратор читают основной файл', async () => {
  for (const telegramId of [ownerTelegramId, teacherTelegramId, adminTelegramId]) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${telegramId}`,
      headers: authHeaders(telegramId),
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'image/jpeg')
    assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
    assert.equal(response.body, testImageSvg)
  }
})

test('авторизованный файл поддерживает preview, web-session и nginx-путь', async () => {
  const preview = await app.inject({
    method: 'GET',
    url: `/api/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${ownerTelegramId}&preview=true`,
    headers: authHeaders(ownerTelegramId),
  })
  assert.equal(preview.statusCode, 200)
  assert.equal(preview.headers['content-type'], 'image/jpeg')
  assert.deepEqual([...preview.rawPayload.subarray(0, 2)], [0xff, 0xd8])

  const web = await app.inject({
    method: 'GET',
    url: `/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${ownerTelegramId}`,
    headers: { 'x-web-session': webSessionToken },
  })
  assert.equal(web.statusCode, 200)
  assert.equal(web.body, testImageSvg)
})

test('посторонний ученик и неназначенный преподаватель не читают файл', async () => {
  const outsider = await app.inject({
    method: 'GET',
    url: `/api/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${outsiderTelegramId}`,
    headers: authHeaders(outsiderTelegramId),
  })
  assert.equal(outsider.statusCode, 403)
  assert.deepEqual(outsider.json(), { ok: false, error: 'Нет доступа к этому файлу.' })

  const teacher = await app.inject({
    method: 'GET',
    url: `/api/homeworks/${fixtureIds.outsiderHomework}/file?telegram_id=${teacherTelegramId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(teacher.statusCode, 403)
  assert.deepEqual(teacher.json(), { ok: false, error: 'Нет доступа к этому файлу.' })
})

test('авторизованный файл сохраняет validation, auth и not-found ошибки', async (context) => {
  await context.test('некорректный id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/nope/file?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(ownerTelegramId),
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('некорректный preview', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${ownerTelegramId}&preview=0`,
      headers: authHeaders(ownerTelegramId),
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${ownerTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(outsiderTelegramId),
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('задание не существует', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/999999/file?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(ownerTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Задание не найдено.' })
  })

  await context.test('у задания нет файла', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.missingFileHomework}/file?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(ownerTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Вложение недоступно для скачивания.',
    })
  })

  await context.test('подписанный неизвестный пользователь не получает существующий файл', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/file?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), { ok: false, error: 'Нет доступа к этому файлу.' })
  })
})

test('владелец, назначенный преподаватель и администратор читают файл исправления', async () => {
  for (const telegramId of [ownerTelegramId, teacherTelegramId, adminTelegramId]) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${telegramId}`,
      headers: authHeaders(telegramId),
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'image/jpeg')
    assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
    assert.equal(response.body, testImageSvg)
  }
})

test('файл исправления поддерживает preview, web-session и nginx-путь', async () => {
  const preview = await app.inject({
    method: 'GET',
    url: `/api/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${ownerTelegramId}&preview=1`,
    headers: authHeaders(ownerTelegramId),
  })
  assert.equal(preview.statusCode, 200)
  assert.equal(preview.headers['content-type'], 'image/jpeg')
  assert.deepEqual([...preview.rawPayload.subarray(0, 2)], [0xff, 0xd8])

  const web = await app.inject({
    method: 'GET',
    url: `/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${ownerTelegramId}`,
    headers: { 'x-web-session': webSessionToken },
  })
  assert.equal(web.statusCode, 200)
  assert.equal(web.body, testImageSvg)
})

test('посторонний ученик не читает файл исправления', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${outsiderTelegramId}`,
    headers: authHeaders(outsiderTelegramId),
  })
  assert.equal(response.statusCode, 403)
  assert.deepEqual(response.json(), { ok: false, error: 'Нет доступа к этому файлу.' })
})

test('файл исправления сохраняет validation, auth и not-found ошибки', async (context) => {
  await context.test('некорректный id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/nope/revision/file?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(ownerTelegramId),
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('некорректный preview', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${ownerTelegramId}&preview=0`,
      headers: authHeaders(ownerTelegramId),
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${ownerTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${ownerTelegramId}`,
      headers: authHeaders(outsiderTelegramId),
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('файл исправления отсутствует до проверки доступа', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.missingFileHomework}/revision/file?telegram_id=${outsiderTelegramId}`,
      headers: authHeaders(outsiderTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Файл исправления не найден.' })
  })

  await context.test('подписанный неизвестный пользователь не получает файл', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'GET',
      url: `/api/homeworks/${fixtureIds.ownerHomework}/revision/file?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), { ok: false, error: 'Нет доступа к этому файлу.' })
  })
})
