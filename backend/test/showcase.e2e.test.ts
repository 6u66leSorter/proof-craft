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
import { createTestDatabase } from './support/test-database.js'

const botToken = '123456:nest-showcase-contract-token'
const studentTelegramId = 6101

let temporaryRoot: string
let app: NestFastifyApplication
let fixtureIds: {
  photo: number
  duplicatePhoto: number
  video: number
  document: number
  pending: number
  missingFile: number
}

const seedShowcase = (databasePath: string): typeof fixtureIds => {
  const db = new Database(databasePath)
  const uploadsDirectory = join(dirname(databasePath), 'uploads')
  mkdirSync(uploadsDirectory, { recursive: true })
  const photoFile = join(uploadsDirectory, 'showcase-photo.jpg')
  const videoFile = join(uploadsDirectory, 'showcase-video.mp4')
  const missingFile = join(uploadsDirectory, 'missing-photo.jpg')
  writeFileSync(photoFile, 'photo-content')
  writeFileSync(videoFile, 'video-content')

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, role)
    VALUES (?, ?, 'student')
  `)
  const aliceUserId = Number(insertUser.run(studentTelegramId, 'Alice').lastInsertRowid)
  const bobUserId = Number(insertUser.run(6102, 'Bob').lastInsertRowid)
  db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, 'student')`).run(aliceUserId)

  const insertStudent = db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status)
    VALUES (?, ?, '+70000000000', 0, ?)
  `)
  const aliceStudentId = Number(
    insertStudent.run(aliceUserId, 'Алиса Ученица', 'studying').lastInsertRowid,
  )
  const bobStudentId = Number(
    insertStudent.run(bobUserId, 'Боб Выпускник', 'completed').lastInsertRowid,
  )

  const insertHomework = db.prepare(`
    INSERT INTO homeworks
      (student_id, lesson_number, content_type, file_id, status, haircut_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const photo = Number(
    insertHomework.run(
      aliceStudentId,
      1,
      'photo',
      photoFile,
      'approved',
      'Фейд',
      '2026-06-06 12:00:00',
    ).lastInsertRowid,
  )
  const duplicatePhoto = Number(
    insertHomework.run(
      aliceStudentId,
      2,
      'photo',
      photoFile,
      'approved',
      'Кроп',
      '2026-05-05 12:00:00',
    ).lastInsertRowid,
  )
  const video = Number(
    insertHomework.run(
      bobStudentId,
      3,
      'video',
      videoFile,
      'approved',
      null,
      '2026-04-04 12:00:00',
    ).lastInsertRowid,
  )
  const document = Number(
    insertHomework.run(
      aliceStudentId,
      4,
      'document',
      photoFile,
      'approved',
      'Схема',
      '2026-03-03 12:00:00',
    ).lastInsertRowid,
  )
  const pending = Number(
    insertHomework.run(
      aliceStudentId,
      5,
      'photo',
      photoFile,
      'pending',
      'На проверке',
      '2026-02-02 12:00:00',
    ).lastInsertRowid,
  )
  const missingFileId = Number(
    insertHomework.run(
      aliceStudentId,
      6,
      'photo',
      missingFile,
      'approved',
      'Без файла',
      '2026-01-01 12:00:00',
    ).lastInsertRowid,
  )
  db.close()
  return { photo, duplicatePhoto, video, document, pending, missingFile: missingFileId }
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `showcase-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Showcase' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'))
  return params.toString()
}

const authenticatedHeaders = (telegramId = studentTelegramId): Record<string, string> => ({
  'x-telegram-init-data': buildTelegramInitData(telegramId),
})

before(async () => {
  const fixture = await createTestDatabase('proof-craft-showcase-')
  temporaryRoot = fixture.temporaryRoot
  fixtureIds = seedShowcase(fixture.databasePath)
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

test('GET /api/showcase/homeworks возвращает approved media без дублей', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/showcase/homeworks?telegram_id=${studentTelegramId}&limit=2`,
    headers: authenticatedHeaders(),
  })
  assert.equal(response.statusCode, 200)
  const body = response.json() as {
    ok: boolean
    data: { cycled: boolean; homeworks: Array<{ id: number }> }
  }
  assert.equal(body.ok, true)
  assert.equal(body.data.cycled, false)
  assert.deepEqual(
    new Set(body.data.homeworks.map(({ id }) => id)),
    new Set([fixtureIds.photo, fixtureIds.video]),
  )
  assert.ok(!body.data.homeworks.some(({ id }) => id === fixtureIds.duplicatePhoto))
})

test('showcase циклически дополняет exclude_ids', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/showcase/homeworks?telegram_id=${studentTelegramId}&limit=2&exclude_ids=${fixtureIds.photo}`,
    headers: authenticatedHeaders(),
  })
  assert.equal(response.statusCode, 200)
  const body = response.json() as { data: { cycled: boolean; homeworks: Array<{ id: number }> } }
  assert.equal(body.data.cycled, true)
  assert.deepEqual(
    new Set(body.data.homeworks.map(({ id }) => id)),
    new Set([fixtureIds.photo, fixtureIds.video]),
  )
})

test('showcase проверяет credential и query', async (context) => {
  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/showcase/homeworks?telegram_id=${studentTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('credential не совпадает с telegram_id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/showcase/homeworks?telegram_id=${studentTelegramId}`,
      headers: authenticatedHeaders(6102),
    })
    assert.equal(response.statusCode, 403)
  })

  await context.test('некорректный limit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/showcase/homeworks?telegram_id=${studentTelegramId}&limit=13`,
      headers: authenticatedHeaders(),
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })

  await context.test('подписанный новый пользователь имеет доступ', async () => {
    const unknownTelegramId = 6999
    const response = await app.inject({
      method: 'GET',
      url: `/api/showcase/homeworks?telegram_id=${unknownTelegramId}&limit=1`,
      headers: authenticatedHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 200)
  })
})

test('GET /api/showcase/homeworks/:id/file отдаёт фото и видео', async (context) => {
  await context.test('фото', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/showcase/homeworks/${fixtureIds.photo}/file?telegram_id=${studentTelegramId}`,
      headers: authenticatedHeaders(),
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'image/jpeg')
    assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
    assert.equal(response.body, 'photo-content')
  })

  await context.test('видео завершившего обучение ученика', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/showcase/homeworks/${fixtureIds.video}/file?telegram_id=${studentTelegramId}`,
      headers: authenticatedHeaders(),
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'video/mp4')
    assert.equal(response.body, 'video-content')
  })
})

test('showcase file сохраняет legacy 400/404-ошибки', async (context) => {
  const request = async (id: number | string) =>
    await app.inject({
      method: 'GET',
      url: `/api/showcase/homeworks/${id}/file?telegram_id=${studentTelegramId}`,
      headers: authenticatedHeaders(),
    })

  await context.test('pending', async () => {
    const response = await request(fixtureIds.pending)
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Работа не найдена.' })
  })

  await context.test('document', async () => {
    const response = await request(fixtureIds.document)
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Файл для предпросмотра недоступен.',
    })
  })

  await context.test('отсутствующий файл', async () => {
    const response = await request(fixtureIds.missingFile)
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Вложение недоступно для скачивания.',
    })
  })

  await context.test('некорректный id', async () => {
    const response = await request('nope')
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })
})

test('showcase поддерживает nginx-путь без /api', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/showcase/homeworks?telegram_id=${studentTelegramId}&limit=1`,
    headers: authenticatedHeaders(),
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.homeworks.length, 1)
})
