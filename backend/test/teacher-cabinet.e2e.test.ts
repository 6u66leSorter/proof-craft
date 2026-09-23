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

const botToken = '123456:nest-teacher-cabinet-token'
const teacherWebSessionToken = 'nest-teacher-cabinet-web-session'
const teacherTelegramId = 9101
const assignedStudentTelegramId = 9201
const unassignedStudentTelegramId = 9202
const adminTelegramId = 9301
const ordinaryUserTelegramId = 9401

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
let ids: {
  teacherId: number
  assignedStudentId: number
  unassignedStudentId: number
  olderPendingId: number
  latestPendingId: number
  approvedId: number
  unassignedPendingId: number
  reviewId: number
  attachmentId: number
}

const seedTeacherCabinet = (path: string): typeof ids => {
  const db = new Database(path)
  const uploads = join(dirname(path), 'uploads')
  mkdirSync(uploads, { recursive: true })
  const localFile = join(uploads, 'teacher-cabinet.txt')
  writeFileSync(localFile, 'teacher cabinet')

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, ?, ?, ?)
  `)
  const teacherUserId = Number(insertUser.run(teacherTelegramId, 'Ирина', 'Учитель', 'teacher').lastInsertRowid)
  const assignedUserId = Number(insertUser.run(assignedStudentTelegramId, 'Анна', 'Ученица', 'student').lastInsertRowid)
  const unassignedUserId = Number(insertUser.run(unassignedStudentTelegramId, 'Мария', 'Ученица', 'student').lastInsertRowid)
  const adminUserId = Number(insertUser.run(adminTelegramId, 'Админ', 'Тестовый', 'admin').lastInsertRowid)
  const ordinaryUserId = Number(insertUser.run(ordinaryUserTelegramId, 'Обычный', 'Пользователь', 'guest').lastInsertRowid)
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
  insertRole.run(teacherUserId, 'teacher')
  insertRole.run(assignedUserId, 'student')
  insertRole.run(unassignedUserId, 'student')
  insertRole.run(adminUserId, 'admin')
  insertRole.run(ordinaryUserId, 'guest')

  const teacherId = Number(db.prepare(`
    INSERT INTO teachers (user_id, full_name) VALUES (?, '  Ирина Учитель  ')
  `).run(teacherUserId).lastInsertRowid)
  const insertStudent = db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, student_track, metro, about_me, avatar_file_id)
    VALUES (?, ?, '+70000000000', ?, ?, ?, ?, ?, ?)
  `)
  const assignedStudentId = Number(insertStudent.run(
    assignedUserId,
    'Анна Ученица',
    10,
    'studying',
    'intern',
    'Центральная',
    'О профиле',
    localFile,
  ).lastInsertRowid)
  const unassignedStudentId = Number(insertStudent.run(
    unassignedUserId,
    'Мария Ученица',
    15,
    'completed',
    'student',
    null,
    null,
    null,
  ).lastInsertRowid)
  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
    .run(assignedStudentId, teacherId)

  const insertHomework = db.prepare(`
    INSERT INTO homeworks
      (student_id, lesson_number, is_bonus, content_type, file_id, text_content,
       status, haircut_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const olderPendingId = Number(insertHomework.run(
    assignedStudentId, 2, 0, 'photo', localFile, 'Старая pending', 'pending', 'Кроп',
    '2026-09-23 10:00:00', '2026-09-23 10:00:00',
  ).lastInsertRowid)
  const latestPendingId = Number(insertHomework.run(
    assignedStudentId, 3, 1, 'photo', localFile, 'Новая pending', 'pending', null,
    '2026-09-24 10:00:00', '2026-09-24 10:00:00',
  ).lastInsertRowid)
  const approvedId = Number(insertHomework.run(
    assignedStudentId, 1, 0, 'photo', localFile, 'Принятая', 'approved', 'Фейд',
    '2026-09-22 10:00:00', '2026-09-22 10:00:00',
  ).lastInsertRowid)
  const unassignedPendingId = Number(insertHomework.run(
    unassignedStudentId, 4, 0, 'text', null, 'Чужая pending', 'pending', 'Бокс',
    '2026-09-25 10:00:00', '2026-09-25 10:00:00',
  ).lastInsertRowid)
  const reviewId = Number(db.prepare(`
    INSERT INTO homework_reviews
      (homework_id, teacher_id, rating, comment, status, created_at)
    VALUES (?, ?, 5, 'Отлично', 'approved', '2026-09-22 11:00:00')
  `).run(approvedId, teacherId).lastInsertRowid)
  db.prepare(`
    INSERT INTO homework_comments (homework_id, author_user_id, text_content, created_at)
    VALUES (?, ?, 'Комментарий', '2026-09-22 12:00:00')
  `).run(approvedId, teacherUserId)
  const attachmentId = Number(db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order)
    VALUES (?, 'telegram_attachment_file_12345', 'photo', 0)
  `).run(approvedId).lastInsertRowid)
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    teacherUserId,
    crypto.createHash('sha256').update(teacherWebSessionToken).digest('hex'),
  )
  db.close()
  return {
    teacherId,
    assignedStudentId,
    unassignedStudentId,
    olderPendingId,
    latestPendingId,
    approvedId,
    unassignedPendingId,
    reviewId,
    attachmentId,
  }
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `teacher-cabinet-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Teacher cabinet' }),
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
  const fixture = await createLegacyDatabase('proof-craft-teacher-cabinet-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  ids = seedTeacherCabinet(databasePath)
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

test('GET teacher/dashboard ограничивает преподавателя назначенными учениками', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/teacher/dashboard?telegram_id=${teacherTelegramId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    data: {
      pendingCount: 2,
      latest: {
        id: ids.latestPendingId,
        student_id: ids.assignedStudentId,
        student_name: 'Анна Ученица',
        lesson_number: 3,
        is_bonus: true,
        haircut_name: null,
        created_at: '2026-09-24 10:00:00',
      },
      students: [{
        id: ids.assignedStudentId,
        full_name: 'Анна Ученица',
        pending_count: 2,
        has_avatar: true,
        telegram_id: assignedStudentTelegramId,
        username: null,
        first_name: 'Анна',
        last_name: 'Ученица',
      }],
      lastStudents: [{
        student_id: ids.assignedStudentId,
        student_name: 'Анна Ученица',
      }],
    },
  })
})

test('GET teacher/dashboard разрешает администратору всех активных учеников', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/teacher/dashboard?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.json().data.pendingCount, 3)
  assert.equal(response.json().data.latest.id, ids.unassignedPendingId)
  assert.deepEqual(
    response.json().data.students.map(({ id, pending_count }: { id: number; pending_count: number }) => ({ id, pending_count })),
    [
      { id: ids.assignedStudentId, pending_count: 2 },
      { id: ids.unassignedStudentId, pending_count: 1 },
    ],
  )
})

test('GET teacher/students возвращает назначенных и агрегаты рейтинга', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/teacher/students?telegram_id=${teacherTelegramId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.students, [{
    id: ids.assignedStudentId,
    full_name: 'Анна Ученица',
    lessons_count: 10,
    status: 'studying',
    average_rating: 5,
    student_track: 'intern',
    ratings_count: 1,
    pending_homeworks_count: 2,
    has_avatar: true,
    teachers: [{ id: ids.teacherId, full_name: 'Ирина Учитель' }],
  }])

  const admin = await app.inject({
    method: 'GET',
    url: `/teacher/students?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.deepEqual(
    admin.json().data.students.map(({ id }: { id: number }) => id),
    [ids.assignedStudentId, ids.unassignedStudentId],
  )
})

test('GET teacher/student-homeworks по умолчанию возвращает только pending', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/teacher/student-homeworks?telegram_id=${teacherTelegramId}&student_id=${ids.assignedStudentId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(response.statusCode, 200)
  const data = response.json().data
  assert.equal(data.student.average_rating, 5)
  assert.equal(data.student.ratings_count, 1)
  assert.equal(data.student.about_me, 'О профиле')
  assert.deepEqual(data.homeworks.map(({ id }: { id: number }) => id), [
    ids.latestPendingId,
    ids.olderPendingId,
  ])
})

test('teacher/student-homeworks поддерживает include_reviewed, web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/teacher/student-homeworks?telegram_id=${teacherTelegramId}&student_id=${ids.assignedStudentId}&include_reviewed=TRUE`,
    headers: { 'x-web-session': teacherWebSessionToken },
  })
  assert.equal(response.statusCode, 200)
  const homeworks = response.json().data.homeworks
  assert.deepEqual(homeworks.map(({ id }: { id: number }) => id), [
    ids.latestPendingId,
    ids.olderPendingId,
    ids.approvedId,
  ])
  const approved = homeworks.find(({ id }: { id: number }) => id === ids.approvedId)
  assert.equal(approved.latest_review.id, ids.reviewId)
  assert.equal(approved.comments[0].author_role, 'teacher')
  assert.deepEqual(approved.attachments, [{
    id: ids.attachmentId,
    content_type: 'photo',
    has_local_file: false,
    has_telegram_file: true,
  }])
})

test('teacher/student-homeworks проверяет назначение, а администратор видит всех', async () => {
  const forbidden = await app.inject({
    method: 'GET',
    url: `/api/teacher/student-homeworks?telegram_id=${teacherTelegramId}&student_id=${ids.unassignedStudentId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(forbidden.statusCode, 403)
  assert.deepEqual(forbidden.json(), {
    ok: false,
    error: 'Ученик не прикреплён к этому преподавателю.',
  })

  const admin = await app.inject({
    method: 'GET',
    url: `/api/teacher/student-homeworks?telegram_id=${adminTelegramId}&student_id=${ids.unassignedStudentId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(admin.statusCode, 200)
  assert.deepEqual(admin.json().data.homeworks.map(({ id }: { id: number }) => id), [
    ids.unassignedPendingId,
  ])
})

test('кабинет преподавателя сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('student_id проверяется до credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/teacher/student-homeworks?telegram_id=${teacherTelegramId}&student_id=nope`,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })
  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/teacher/dashboard?telegram_id=${teacherTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })
  await context.test('пользователь не найден', async () => {
    const unknownTelegramId = 9999
    const response = await app.inject({
      method: 'GET',
      url: `/api/teacher/students?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })
  await context.test('пользователь не преподаватель', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/teacher/students?telegram_id=${ordinaryUserTelegramId}`,
      headers: authHeaders(ordinaryUserTelegramId),
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Доступ только для преподавателей.',
    })
  })
})
