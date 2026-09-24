import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const vkSecret = 'nest-web-auth-vk-secret'
const studentTelegramId = 9401
const teacherTelegramId = 9402

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication

const tokenHash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

const buildVkLaunchParams = (vkUserId: number): string => {
  const params = new URLSearchParams({ vk_app_id: '54558405', vk_user_id: String(vkUserId) })
  const checkString = [...params.entries()].map(([key, value]) => `${key}=${value}`).sort().join('&')
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

const start = async (provider: unknown) =>
  await app.inject({ method: 'POST', url: '/api/web-auth/start', headers: { 'content-type': 'application/json' }, payload: { provider } })

const status = async (token: string) => await app.inject({ method: 'GET', url: `/api/web-auth/status?token=${token}` })

const approveLoginAs = (token: string, telegramId: number) =>
  withDb((db) => db.prepare(`
    UPDATE web_login_requests SET user_id = (SELECT id FROM users WHERE telegram_id = ?), approved_at = datetime('now')
    WHERE token_hash = ?
  `).run(telegramId, tokenHash(token)))

const confirmVk = async (token: string, headerVkUserId: number, launchParams: string) =>
  await app.inject({
    method: 'POST',
    url: `/api/web-auth/confirm/vk?token=${token}`,
    headers: { 'x-client-platform': 'vk', 'x-vk-user-id': String(headerVkUserId), 'x-vk-launch-params': launchParams },
  })

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-web-auth-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  withDb((db) => {
    const insertUser = db.prepare(`INSERT INTO users (telegram_id, first_name, role, vk_user_id) VALUES (?, ?, ?, ?)`)
    const student = Number(insertUser.run(studentTelegramId, 'Student', 'student', 7001).lastInsertRowid)
    const teacher = Number(insertUser.run(teacherTelegramId, 'Teacher', 'teacher', null).lastInsertRowid)
    db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, 'student'), (?, 'teacher')`).run(student, teacher)
  })
  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.VK_APP_ID = '54558405'
  process.env.VK_APP_SECRET = vkSecret
  process.env.VK_ID_OFFSET = '10000000000'
  process.env.TELEGRAM_BOT_USERNAME = '@nest_academy_bot'
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('start выдаёт одноразовый токен и ссылку, 400 для неизвестного провайдера, 503 без бота', async () => {
  const telegram = await start('telegram')
  assert.equal(telegram.statusCode, 200)
  const { token, handoff_url: handoff, expires_in_seconds: ttl } = telegram.json().data
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(handoff, `https://t.me/nest_academy_bot?start=webauth_${token}`)
  assert.equal(ttl, 900)
  const vk = await start('vk')
  assert.equal(vk.json().data.handoff_url, `https://vk.com/app54558405?web_login=${vk.json().data.token}`)
  const row = withDb((db) => db.prepare(`
    SELECT provider, user_id, (julianday(expires_at) - julianday('now')) * 1440 AS minutes FROM web_login_requests WHERE token_hash = ?
  `).get(tokenHash(vk.json().data.token))) as { provider: string; user_id: number | null; minutes: number }
  assert.equal(row.provider, 'vk')
  assert.equal(row.user_id, null)
  assert.ok(row.minutes > 14.9 && row.minutes <= 15)
  const invalid = await start('email')
  assert.deepEqual([invalid.statusCode, invalid.json()], [400, { ok: false, error: 'Некорректные параметры запроса.' }])
  const username = process.env.TELEGRAM_BOT_USERNAME
  process.env.TELEGRAM_BOT_USERNAME = ''
  const unconfigured = await start('telegram')
  process.env.TELEGRAM_BOT_USERNAME = username
  assert.deepEqual([unconfigured.statusCode, unconfigured.json()], [503, { ok: false, error: 'Вход через Telegram ещё не настроен на сервере.' }])
})

test('status: pending, approved с выпуском сессии ровно один раз, истёкший и короткий токен', async () => {
  const token = (await start('telegram')).json().data.token
  const pending = await status(token)
  assert.deepEqual([pending.statusCode, pending.json()], [200, { ok: true, data: { status: 'pending' } }])
  approveLoginAs(token, studentTelegramId)
  const approved = await status(token)
  assert.equal(approved.statusCode, 200)
  const data = approved.json().data
  assert.equal(data.status, 'approved')
  assert.equal(data.telegram_id, studentTelegramId)
  assert.match(data.session_token, /^[A-Za-z0-9_-]{43}$/)
  const session = withDb((db) => db.prepare(`
    SELECT u.telegram_id, (julianday(ws.expires_at) - julianday('now')) AS days FROM web_sessions ws JOIN users u ON u.id = ws.user_id WHERE ws.token_hash = ?
  `).get(tokenHash(data.session_token))) as { telegram_id: number; days: number }
  assert.equal(session.telegram_id, studentTelegramId)
  assert.ok(session.days > 13.99 && session.days <= 14)
  const reused = await status(token)
  assert.deepEqual([reused.statusCode, reused.json()], [410, { ok: false, error: 'Время подтверждения входа истекло. Начните заново.' }])
  const short = await status('short')
  assert.deepEqual([short.statusCode, short.json()], [400, { ok: false, error: 'Некорректные параметры запроса.' }])
})

test('session и logout проверяют и удаляют web-сессию', async () => {
  const token = (await start('telegram')).json().data.token
  approveLoginAs(token, teacherTelegramId)
  const sessionToken = (await status(token)).json().data.session_token
  const check = await app.inject({ method: 'GET', url: '/api/web-auth/session', headers: { 'x-web-session': sessionToken } })
  assert.deepEqual([check.statusCode, check.json()], [200, { ok: true, data: { telegram_id: teacherTelegramId } }])
  const logout = await app.inject({ method: 'POST', url: '/api/web-auth/logout', headers: { 'x-web-session': sessionToken } })
  assert.deepEqual([logout.statusCode, logout.json()], [200, { ok: true }])
  const after = await app.inject({ method: 'GET', url: '/api/web-auth/session', headers: { 'x-web-session': sessionToken } })
  assert.deepEqual([after.statusCode, after.json()], [401, { ok: false, error: 'Сессия сайта истекла. Войдите снова.' }])
  const anonymous = await app.inject({ method: 'POST', url: '/api/web-auth/logout' })
  assert.deepEqual([anonymous.statusCode, anonymous.json()], [200, { ok: true }])
})

test('confirm/vk подтверждает вход по подписанным параметрам один раз и пишет аудит', async () => {
  const token = (await start('vk')).json().data.token
  const unsigned = await confirmVk(token, 7001, 'vk_user_id=7001&sign=broken')
  assert.deepEqual([unsigned.statusCode, unsigned.json()], [401, { ok: false, error: 'Не удалось подтвердить вход через VK.' }])
  const confirmed = await confirmVk(token, 7001, buildVkLaunchParams(7001))
  assert.deepEqual([confirmed.statusCode, confirmed.json()], [200, { ok: true, data: { approved: true } }])
  const approvedBy = withDb((db) => db.prepare(`
    SELECT u.telegram_id FROM web_login_requests r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?
  `).get(tokenHash(token))) as { telegram_id: number }
  assert.equal(approvedBy.telegram_id, studentTelegramId)
  const audit = withDb((db) => db.prepare('SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1').get())
  assert.deepEqual(audit, { action: 'web_login_approved', meta: JSON.stringify({ provider: 'vk' }) })
  const reused = await confirmVk(token, 7001, buildVkLaunchParams(7001))
  assert.deepEqual([reused.statusCode, reused.json()], [410, { ok: false, error: 'Ссылка для входа недействительна или уже использована.' }])
  const telegramToken = (await start('telegram')).json().data.token
  assert.equal((await confirmVk(telegramToken, 7001, buildVkLaunchParams(7001))).statusCode, 410)
})

test('confirm/vk создаёт guest-пользователя для нового VK id и отклоняет чужой X-VK-User-Id (SEC-005)', async () => {
  const token = (await start('vk')).json().data.token
  const forged = await confirmVk(token, 7777, buildVkLaunchParams(7001))
  assert.deepEqual([forged.statusCode, forged.json()], [401, { ok: false, error: 'Не удалось подтвердить вход через VK.' }])
  const fresh = await confirmVk(token, 8888, buildVkLaunchParams(8888))
  assert.equal(fresh.statusCode, 200)
  const user = withDb((db) => db.prepare(`
    SELECT u.telegram_id, u.vk_user_id, u.role, (SELECT group_concat(role) FROM user_roles WHERE user_id = u.id) AS roles
    FROM web_login_requests r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?
  `).get(tokenHash(token)))
  assert.deepEqual(user, { telegram_id: 10000008888, vk_user_id: 8888, role: 'guest', roles: 'guest' })
})
