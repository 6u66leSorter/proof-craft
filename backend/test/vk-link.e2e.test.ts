import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { createTestDatabase } from './support/test-database.js'

const botToken = '123456:nest-vk-link-token'
const vkSecret = 'nest-vk-link-secret'
const offset = 10_000_000_000
const tg = { admin: 9501, teacher: 9502, student: 9503, other: 9504 }

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication

const buildTelegramInitData = (telegramId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `vk-link-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: 'Link' }),
  })
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'))
  return params.toString()
}

const buildVkLaunchParams = (vkUserId: number): string => {
  const params = new URLSearchParams({ vk_app_id: '54558405', vk_user_id: String(vkUserId) })
  const checkString = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('&')
  params.set('sign', crypto.createHmac('sha256', vkSecret).update(checkString).digest('base64url'))
  return params.toString()
}

const withDb = <T>(fn: (db: Database.Database) => T): T => {
  const db = new Database(databasePath)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}

const telegramPost = async (url: string, telegramId: number | null, payload: object) =>
  await app.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', ...(telegramId == null ? {} : { 'x-telegram-init-data': buildTelegramInitData(telegramId) }) },
    payload,
  })

const vkPost = async (url: string, vkUserId: number, payload: object) =>
  await app.inject({
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/json',
      'x-client-platform': 'vk',
      'x-vk-user-id': String(vkUserId),
      'x-app-user-id': String(offset + vkUserId),
      'x-vk-launch-params': buildVkLaunchParams(vkUserId),
    },
    payload,
  })

const issueCode = async (telegramId: number): Promise<string> =>
  (await telegramPost('/api/account/vk-link-token', telegramId, { telegram_id: telegramId })).json().data.token
const confirm = async (vkUserId: number, token: string) =>
  await vkPost('/api/account/vk-link-confirm', vkUserId, { telegram_id: offset + vkUserId, token })
const userVk = (telegramId: number) =>
  withDb((db) => (db.prepare('SELECT vk_user_id FROM users WHERE telegram_id = ?').get(telegramId) as { vk_user_id: number | null } | undefined)?.vk_user_id ?? null)
const lastAudit = () => withDb((db) => db.prepare('SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1').get())

before(async () => {
  const fixture = await createTestDatabase('proof-craft-vk-link-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  withDb((db) => {
    const insertUser = db.prepare(`INSERT INTO users (telegram_id, first_name, role, vk_user_id) VALUES (?, ?, ?, ?)`)
    const addRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
    const admin = Number(insertUser.run(tg.admin, 'Admin', 'admin', null).lastInsertRowid)
    const teacher = Number(insertUser.run(tg.teacher, 'Teacher', 'teacher', null).lastInsertRowid)
    const student = Number(insertUser.run(tg.student, 'Student', 'student', 7001).lastInsertRowid)
    const other = Number(insertUser.run(tg.other, 'Other', 'student', null).lastInsertRowid)
    addRole.run(admin, 'admin')
    addRole.run(teacher, 'teacher')
    addRole.run(student, 'student')
    addRole.run(other, 'student')
    db.prepare(`INSERT INTO students (user_id, full_name, phone, lessons_count, status) VALUES (?, 'Student', '+7999', 10, 'studying')`).run(student)
  })
  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TG_WEBAPP_AUTH = 'strict'
  process.env.VK_APP_ID = '54558405'
  process.env.VK_APP_SECRET = vkSecret
  process.env.VK_ID_OFFSET = String(offset)
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('vk-link-token выдаёт 4-значный код из Telegram и заменяет прежний', async () => {
  const first = await telegramPost('/api/account/vk-link-token', tg.other, { telegram_id: tg.other })
  assert.equal(first.statusCode, 200)
  assert.match(first.json().data.token, /^[0-9]{4}$/)
  assert.match(first.json().data.expires_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  await issueCode(tg.other)
  const tokens = withDb((db) => (db.prepare(`SELECT COUNT(*) AS count FROM vk_link_tokens t JOIN users u ON u.id = t.user_id WHERE u.telegram_id = ?`).get(tg.other) as { count: number }).count)
  assert.equal(tokens, 1)
  assert.deepEqual(lastAudit(), { action: 'vk_link_token_created', meta: '{}' })
  const fromVk = await vkPost('/api/account/vk-link-token', 7001, { telegram_id: offset + 7001 })
  assert.deepEqual([fromVk.statusCode, fromVk.json()], [403, { ok: false, error: 'Код выдаётся только из мини-приложения Telegram.' }])
  const unknown = await telegramPost('/api/account/vk-link-token', 5555, { telegram_id: 5555 })
  assert.deepEqual([unknown.statusCode, unknown.json()], [404, { ok: false, error: 'Сначала откройте приложение из Telegram-бота.' }])
})

test('vk-link-confirm привязывает VK один раз, признаёт повтор и отклоняет другой VK', async () => {
  const token = await issueCode(tg.other)
  const linked = await confirm(7100, token)
  assert.deepEqual([linked.statusCode, linked.json()], [200, { ok: true, data: { linked: true } }])
  assert.equal(userVk(tg.other), 7100)
  assert.deepEqual(lastAudit(), { action: 'vk_link_completed', meta: JSON.stringify({ vk_user_id: 7100 }) })
  const reused = await confirm(7100, token)
  assert.deepEqual([reused.statusCode, reused.json()], [400, { ok: false, error: 'Код недействителен или истёк. Создайте новый код в Telegram.' }])
  const again = await confirm(7100, await issueCode(tg.other))
  assert.deepEqual([again.statusCode, again.json()], [200, { ok: true, data: { linked: true, already: true } }])
  const other = await confirm(7101, await issueCode(tg.other))
  assert.deepEqual([other.statusCode, other.json()], [409, { ok: false, error: 'К этому аккаунту Telegram уже привязан другой профиль VK. Обратитесь к администратору.' }])
})

test('vk-link-confirm поглощает пустой VK-аккаунт и не трогает аккаунт с данными', async () => {
  withDb((db) => {
    const id = Number(db.prepare(`INSERT INTO users (telegram_id, role, vk_user_id) VALUES (?, 'guest', 7200)`).run(offset + 7200).lastInsertRowid)
    db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, 'guest')`).run(id)
    db.prepare(`INSERT INTO app_notifications (user_id, kind, body) VALUES (?, 'x', 'x')`).run(id)
  })
  const merged = await confirm(7200, await issueCode(tg.teacher))
  assert.deepEqual([merged.statusCode, merged.json()], [200, { ok: true, data: { linked: true } }])
  assert.equal(userVk(tg.teacher), 7200)
  assert.equal(withDb((db) => (db.prepare('SELECT COUNT(*) AS count FROM users WHERE telegram_id = ?').get(offset + 7200) as { count: number }).count), 0)
  const withData = await confirm(7001, await issueCode(tg.admin))
  assert.deepEqual([withData.statusCode, withData.json()], [409, {
    ok: false,
    error: 'С этим аккаунтом VK уже связаны данные (заявка, сообщения или чат). Свяжитесь с администратором для объединения.',
  }])
  assert.equal(userVk(tg.admin), null)
})

test('vk-link-confirm сохраняет validation, platform и auth ошибки', async () => {
  const badFormat = await vkPost('/api/account/vk-link-confirm', 7300, { telegram_id: offset + 7300, token: '12a4' })
  assert.deepEqual([badFormat.statusCode, badFormat.json()], [400, { ok: false, error: 'Некорректные параметры запроса.' }])
  const fromTelegram = await telegramPost('/api/account/vk-link-confirm', tg.student, { telegram_id: tg.student, token: '1234' })
  assert.deepEqual([fromTelegram.statusCode, fromTelegram.json()], [403, { ok: false, error: 'Подтверждение доступно только из VK.' }])
  const unsigned = await telegramPost('/api/account/vk-link-confirm', null, { telegram_id: tg.student, token: '1234' })
  assert.equal(unsigned.statusCode, 401)
})
