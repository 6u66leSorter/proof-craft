import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { createLegacyDatabase } from './support/legacy-database.js'

const botToken = '123456:nest-comments-token'
const adminTelegramId = 9101
const teacherTelegramId = 9102
const studentTelegramId = 9103
const strangerTelegramId = 9104
const formerTeacherTelegramId = 9105

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
const ids = { homeworkId: 0, studentId: 0, graduatedHomeworkId: 0 }

const buildTelegramInitData = (telegramId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `comments-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: 'Comments' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set('hash', crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'))
  return params.toString()
}

const postComment = async (homeworkId: number | string, telegramId: number | null, text: unknown) =>
  await app.inject({
    method: 'POST',
    url: `/api/homeworks/${homeworkId}/comments`,
    headers: {
      'content-type': 'application/json',
      ...(telegramId == null ? {} : { 'x-telegram-init-data': buildTelegramInitData(telegramId) }),
    },
    payload: { telegram_id: telegramId ?? studentTelegramId, text_content: text },
  })

const readState = (homeworkId: number) => {
  const db = new Database(databasePath, { readonly: true })
  const comment = db.prepare(`
    SELECT hc.text_content, u.telegram_id AS author_telegram_id
    FROM homework_comments hc JOIN users u ON u.id = hc.author_user_id
    WHERE hc.homework_id = ? ORDER BY hc.id DESC LIMIT 1
  `).get(homeworkId)
  const notifications = db.prepare(`
    SELECT u.telegram_id, n.kind, n.body, n.payload
    FROM app_notifications n JOIN users u ON u.id = n.user_id ORDER BY n.id
  `).all()
  db.close()
  return { comment, notifications }
}

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-comments-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  const db = new Database(databasePath)
  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role, created_at, updated_at)
    VALUES (?, ?, 'User', ?, '2026-09-24 10:00:00', '2026-09-24 10:00:00')
  `)
  const addRole = db.prepare(`INSERT INTO user_roles (user_id, role, created_at) VALUES (?, ?, '2026-09-24 10:00:00')`)
  const admin = Number(insertUser.run(adminTelegramId, 'Admin', 'admin').lastInsertRowid)
  const teacher = Number(insertUser.run(teacherTelegramId, 'Teacher', 'teacher').lastInsertRowid)
  const student = Number(insertUser.run(studentTelegramId, 'Student', 'student').lastInsertRowid)
  const stranger = Number(insertUser.run(strangerTelegramId, 'Stranger', 'student').lastInsertRowid)
  const formerTeacher = Number(insertUser.run(formerTeacherTelegramId, 'Former', 'guest').lastInsertRowid)
  addRole.run(admin, 'admin')
  addRole.run(teacher, 'teacher')
  addRole.run(student, 'student')
  addRole.run(stranger, 'student')
  const insertTeacher = db.prepare(`INSERT INTO teachers (user_id, full_name) VALUES (?, ?)`)
  const teacherId = Number(insertTeacher.run(teacher, 'Teacher User').lastInsertRowid)
  // Снятый с роли преподаватель: профиль и назначение остались (SEC-003), роли нет.
  const formerTeacherId = Number(insertTeacher.run(formerTeacher, 'Former User').lastInsertRowid)
  const insertStudent = db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status) VALUES (?, ?, '+79990000000', 10, ?)
  `)
  ids.studentId = Number(insertStudent.run(student, 'Student User', 'studying').lastInsertRowid)
  insertStudent.run(stranger, 'Stranger User', 'studying')
  const graduateUser = Number(insertUser.run(9106, 'Graduate', 'student').lastInsertRowid)
  const graduateId = Number(insertStudent.run(graduateUser, 'Graduate User', 'rejected').lastInsertRowid)
  const assign = db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
  assign.run(ids.studentId, teacherId)
  assign.run(ids.studentId, formerTeacherId)
  assign.run(graduateId, teacherId)
  const insertHomework = db.prepare(`
    INSERT INTO homeworks (student_id, lesson_number, content_type, text_content, status) VALUES (?, 1, 'text', 'Работа', 'pending')
  `)
  ids.homeworkId = Number(insertHomework.run(ids.studentId).lastInsertRowid)
  ids.graduatedHomeworkId = Number(insertHomework.run(graduateId).lastInsertRowid)
  db.close()

  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
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

test('ответ ученика сохраняется trimmed и уведомляет всех назначенных преподавателей', async () => {
  const response = await postComment(ids.homeworkId, studentTelegramId, '  Вопрос по окантовке  ')
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
  const state = readState(ids.homeworkId)
  assert.deepEqual(state.comment, { text_content: 'Вопрос по окантовке', author_telegram_id: studentTelegramId })
  const payload = JSON.stringify({ homework_id: ids.homeworkId, student_id: ids.studentId })
  assert.deepEqual(state.notifications, [
    { telegram_id: teacherTelegramId, kind: 'homework_comment_reply', body: 'Ученик ответил на комментарий к домашнему заданию.', payload },
    { telegram_id: formerTeacherTelegramId, kind: 'homework_comment_reply', body: 'Ученик ответил на комментарий к домашнему заданию.', payload },
  ])
})

test('комментарий преподавателя уведомляет ученика, администратора — никого', async () => {
  const before = readState(ids.homeworkId).notifications.length
  const teacher = await postComment(ids.homeworkId, teacherTelegramId, 'Подровняйте контур')
  assert.equal(teacher.statusCode, 200)
  const afterTeacher = readState(ids.homeworkId)
  assert.deepEqual(afterTeacher.comment, { text_content: 'Подровняйте контур', author_telegram_id: teacherTelegramId })
  assert.deepEqual(afterTeacher.notifications.at(-1), {
    telegram_id: studentTelegramId,
    kind: 'homework_comment',
    body: 'Преподаватель оставил комментарий к вашему домашнему заданию.',
    payload: JSON.stringify({ homework_id: ids.homeworkId, student_id: ids.studentId }),
  })
  assert.equal(afterTeacher.notifications.length, before + 1)

  const admin = await postComment(ids.homeworkId, adminTelegramId, 'Комментарий администратора')
  assert.equal(admin.statusCode, 200)
  const afterAdmin = readState(ids.homeworkId)
  assert.equal((afterAdmin.comment as { author_telegram_id: number }).author_telegram_id, adminTelegramId)
  assert.equal(afterAdmin.notifications.length, before + 1)
})

test('валидация, доступ и not-found совпадают с legacy', async () => {
  const invalid = { ok: false, error: 'Некорректные параметры запроса.' }
  for (const [homeworkId, text] of [['abc', 'x'], [ids.homeworkId, '   '], [ids.homeworkId, 'x'.repeat(2001)], [ids.homeworkId, 5]] as const) {
    const response = await postComment(homeworkId, studentTelegramId, text)
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), invalid)
  }
  const unknown = await postComment(999999, studentTelegramId, 'x')
  assert.equal(unknown.statusCode, 404)
  assert.deepEqual(unknown.json(), { ok: false, error: 'Домашнее задание не найдено.' })
  const forbidden = { ok: false, error: 'Нет доступа к этому заданию.' }
  for (const telegramId of [strangerTelegramId, formerTeacherTelegramId]) {
    const response = await postComment(ids.homeworkId, telegramId, 'x')
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), forbidden)
  }
  // Legacy пускает преподавателя только к активным ученикам.
  const inactive = await postComment(ids.graduatedHomeworkId, teacherTelegramId, 'x')
  assert.equal(inactive.statusCode, 403)
  const unsigned = await postComment(ids.homeworkId, null, 'x')
  assert.equal(unsigned.statusCode, 401)
})
