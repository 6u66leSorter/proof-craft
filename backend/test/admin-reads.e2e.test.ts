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

const botToken = '123456:nest-admin-reads-token'
const adminWebSessionToken = 'nest-admin-reads-web-session'
const adminTelegramId = 8101
const teacherTelegramId = 8201
const studentTelegramId = 8301
const completedStudentTelegramId = 8302
const applicantTelegramId = 8401

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
let ids: {
  studentId: number
  completedStudentId: number
  teacherId: number
  pendingApplicationId: number
  feedbackIds: number[]
  approvedHomeworkId: number
  pendingHomeworkId: number
  revisionHomeworkId: number
  documentHomeworkId: number
  completedHomeworkId: number
  latestReviewId: number
  localAttachmentId: number
  telegramAttachmentId: number
}

const seedAdminReads = (path: string): typeof ids => {
  const db = new Database(path)
  const uploads = join(dirname(path), 'uploads')
  mkdirSync(uploads, { recursive: true })
  const localFile = join(uploads, 'admin-read-local.txt')
  const revisionFile = join(uploads, 'admin-read-revision.txt')
  writeFileSync(localFile, 'local')
  writeFileSync(revisionFile, 'revision')

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, ?, ?, ?)
  `)
  const adminUserId = Number(insertUser.run(adminTelegramId, 'Admin', 'User', 'admin').lastInsertRowid)
  const teacherUserId = Number(insertUser.run(teacherTelegramId, 'Teacher', 'User', 'teacher').lastInsertRowid)
  const studentUserId = Number(insertUser.run(studentTelegramId, 'Student', 'User', 'student').lastInsertRowid)
  const completedUserId = Number(insertUser.run(completedStudentTelegramId, 'Completed', 'User', 'student').lastInsertRowid)
  const applicantUserId = Number(insertUser.run(applicantTelegramId, 'Applicant', 'User', 'guest').lastInsertRowid)
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
  insertRole.run(adminUserId, 'admin')
  insertRole.run(teacherUserId, 'teacher')
  insertRole.run(studentUserId, 'student')
  insertRole.run(completedUserId, 'student')

  const teacherId = Number(db.prepare(`
    INSERT INTO teachers (user_id, full_name) VALUES (?, '  Teacher   Profile  ')
  `).run(teacherUserId).lastInsertRowid)
  const insertStudent = db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, student_track, metro, about_me, avatar_file_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const studentId = Number(insertStudent.run(
    studentUserId,
    'Student Profile',
    '+70000000001',
    10,
    'studying',
    'intern',
    'Central',
    'О студенте',
    localFile,
  ).lastInsertRowid)
  const completedStudentId = Number(insertStudent.run(
    completedUserId,
    'Completed Profile',
    '+70000000002',
    15,
    'completed',
    'student',
    null,
    null,
    null,
  ).lastInsertRowid)
  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)').run(studentId, teacherId)
  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)').run(completedStudentId, teacherId)

  db.prepare(`
    INSERT INTO teacher_applications
      (applicant_user_id, full_name, phone, status, created_at, updated_at)
    VALUES (?, 'Teacher Profile', '+70000000003', 'approved',
      '2026-09-20 10:00:00', '2026-09-20 11:00:00')
  `).run(teacherUserId)
  const pendingApplicationId = Number(db.prepare(`
    INSERT INTO teacher_applications
      (applicant_user_id, full_name, phone, status, created_at, updated_at)
    VALUES (?, 'Applicant User', '+70000000004', 'pending',
      '2026-09-23 10:00:00', '2026-09-23 10:00:00')
  `).run(applicantUserId).lastInsertRowid)

  const insertHomework = db.prepare(`
    INSERT INTO homeworks
      (student_id, lesson_number, is_bonus, content_type, file_id, text_content,
       status, haircut_name, created_at, updated_at, revision_student_text,
       revision_student_file_id)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const approvedHomeworkId = Number(insertHomework.run(
    studentId, 1, 'photo', localFile, 'Approved', 'approved', 'Fade',
    '2026-09-20 12:00:00', '2026-09-20 12:00:00', null, null,
  ).lastInsertRowid)
  const pendingHomeworkId = Number(insertHomework.run(
    studentId, 2, 'photo', localFile, 'Pending', 'pending', 'Crop',
    '2026-09-23 12:00:00', '2026-09-23 12:00:00', null, null,
  ).lastInsertRowid)
  const revisionHomeworkId = Number(insertHomework.run(
    studentId, 3, 'text', null, 'Revision', 'revision', 'Classic',
    '2026-09-22 12:00:00', '2026-09-22 12:00:00', 'Исправление', revisionFile,
  ).lastInsertRowid)
  const documentHomeworkId = Number(insertHomework.run(
    studentId, 4, 'document', localFile, 'Document', 'approved', 'Scheme',
    '2026-09-19 12:00:00', '2026-09-19 12:00:00', null, null,
  ).lastInsertRowid)
  const completedHomeworkId = Number(insertHomework.run(
    completedStudentId, 1, 'video', localFile, 'Completed', 'approved', 'Box',
    '2026-09-24 12:00:00', '2026-09-24 12:00:00', null, null,
  ).lastInsertRowid)

  const insertReview = db.prepare(`
    INSERT INTO homework_reviews
      (homework_id, teacher_id, rating, comment, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  insertReview.run(approvedHomeworkId, teacherId, 4, 'First', 'approved', '2026-09-20 13:00:00')
  const latestReviewId = Number(insertReview.run(
    approvedHomeworkId, teacherId, 5, 'Latest', 'approved', '2026-09-21 13:00:00',
  ).lastInsertRowid)
  insertReview.run(revisionHomeworkId, teacherId, null, 'Revise', 'rejected', '2026-09-22 13:00:00')

  const localAttachmentId = Number(db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order)
    VALUES (?, ?, 'photo', 0)
  `).run(approvedHomeworkId, revisionFile).lastInsertRowid)
  const telegramAttachmentId = Number(db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order)
    VALUES (?, 'telegram_attachment_file_12345', 'photo', 1)
  `).run(approvedHomeworkId).lastInsertRowid)
  db.prepare(`
    INSERT INTO homework_comments (homework_id, author_user_id, text_content, created_at)
    VALUES (?, ?, 'Student comment', '2026-09-21 14:00:00'),
           (?, ?, 'Teacher comment', '2026-09-21 15:00:00')
  `).run(approvedHomeworkId, studentUserId, approvedHomeworkId, teacherUserId)

  const insertFeedback = db.prepare(`
    INSERT INTO private_feedback (student_id, request_key, subject, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const feedbackIds: number[] = []
  for (let index = 1; index <= 51; index += 1) {
    feedbackIds.push(Number(insertFeedback.run(
      studentId,
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      index % 2 ? 'academy' : 'teacher',
      `Feedback ${index}`,
      `2026-09-23 09:${String(index).padStart(2, '0')}:00`,
    ).lastInsertRowid))
  }
  db.prepare(`
    INSERT INTO audit_log (actor_user_id, action, meta, created_at)
    VALUES (?, 'admin_fixture_old', NULL, '2026-09-20 09:00:00'),
           (?, 'admin_fixture_new', '{"source":"nest"}', '2026-09-23 09:00:00')
  `).run(adminUserId, adminUserId)
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    adminUserId,
    crypto.createHash('sha256').update(adminWebSessionToken).digest('hex'),
  )
  db.close()

  return {
    studentId,
    completedStudentId,
    teacherId,
    pendingApplicationId,
    feedbackIds,
    approvedHomeworkId,
    pendingHomeworkId,
    revisionHomeworkId,
    documentHomeworkId,
    completedHomeworkId,
    latestReviewId,
    localAttachmentId,
    telegramAttachmentId,
  }
}

const buildTelegramInitData = (telegramUserId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `admin-reads-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Admin reads' }),
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
  const fixture = await createLegacyDatabase('proof-craft-admin-reads-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  ids = seedAdminReads(databasePath)
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

test('GET admin/teacher-applications возвращает только pending-заявки', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/admin/teacher-applications?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    data: {
      applications: [{
        id: ids.pendingApplicationId,
        full_name: 'Applicant User',
        phone: '+70000000004',
        telegram_id: applicantTelegramId,
        created_at: '2026-09-23 10:00:00',
      }],
    },
  })
})

test('GET admin/feedback сохраняет cursor-пагинацию', async () => {
  const first = await app.inject({
    method: 'GET',
    url: `/api/admin/feedback?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(first.statusCode, 200)
  assert.equal(first.json().data.items.length, 50)
  assert.deepEqual(first.json().data.items[0], {
    id: ids.feedbackIds[50],
    subject: 'academy',
    message: 'Feedback 51',
    created_at: '2026-09-23 09:51:00',
    full_name: 'Student Profile',
  })
  assert.equal(first.json().data.next, ids.feedbackIds[1])

  const second = await app.inject({
    method: 'GET',
    url: `/admin/feedback?telegram_id=${adminTelegramId}&before=${ids.feedbackIds[1]}`,
    headers: { 'x-web-session': adminWebSessionToken },
  })
  assert.deepEqual(second.json().data, {
    items: [{
      id: ids.feedbackIds[0],
      subject: 'academy',
      message: 'Feedback 1',
      created_at: '2026-09-23 09:01:00',
      full_name: 'Student Profile',
    }],
    next: null,
  })
})

test('GET admin/teachers возвращает телефон и активных учеников', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/admin/teachers?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(response.statusCode, 200)
  const [teacher] = response.json().data.teachers
  assert.deepEqual(teacher, {
    id: ids.teacherId,
    user_id: teacher.user_id,
    full_name: '  Teacher   Profile  ',
    phone: '+70000000003',
    telegram_id: teacherTelegramId,
    username: null,
    students_count: 2,
    students: [
      { id: ids.studentId, full_name: 'Student Profile', telegram_id: studentTelegramId, username: null },
      { id: ids.completedStudentId, full_name: 'Completed Profile', telegram_id: completedStudentTelegramId, username: null },
    ],
  })
})

test('GET admin/students точно фильтрует статусы и возвращает агрегаты', async () => {
  const studying = await app.inject({
    method: 'GET',
    url: `/api/admin/students?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(studying.statusCode, 200)
  assert.equal(studying.json().data.students.length, 1)
  assert.deepEqual(studying.json().data.students[0], {
    id: ids.studentId,
    user_id: studying.json().data.students[0].user_id,
    full_name: 'Student Profile',
    phone: '+70000000001',
    telegram_id: studentTelegramId,
    username: null,
    first_name: 'Student',
    last_name: 'User',
    lessons_count: 10,
    status: 'studying',
    student_track: 'intern',
    teachers: [{ id: ids.teacherId, full_name: 'Teacher Profile' }],
    teacher_ids: [ids.teacherId],
    average_rating: 4.5,
    ratings_count: 2,
    pending_homeworks_count: 1,
    has_avatar: true,
  })

  const completed = await app.inject({
    method: 'GET',
    url: `/api/admin/students?telegram_id=${adminTelegramId}&status=completed`,
    headers: authHeaders(adminTelegramId),
  })
  assert.deepEqual(
    completed.json().data.students.map(({ id, status }: { id: number; status: string }) => ({ id, status })),
    [{ id: ids.completedStudentId, status: 'completed' }],
  )
})

test('GET admin/student/:id возвращает профиль и полный агрегат работ', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/admin/student/${ids.studentId}?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(response.statusCode, 200)
  const data = response.json().data
  assert.equal(data.student.metro, 'Central')
  assert.equal(data.student.about_me, 'О студенте')
  assert.deepEqual(data.homeworks.map(({ id }: { id: number }) => id), [
    ids.pendingHomeworkId,
    ids.revisionHomeworkId,
    ids.approvedHomeworkId,
    ids.documentHomeworkId,
  ])
  const approved = data.homeworks.find(({ id }: { id: number }) => id === ids.approvedHomeworkId)
  assert.equal(approved.review_count, 2)
  assert.equal(approved.latest_review.id, ids.latestReviewId)
  assert.deepEqual(approved.comments.map(({ author_role }: { author_role: string }) => author_role), [
    'student',
    'teacher',
  ])
  assert.deepEqual(approved.attachments.map(({ id }: { id: number }) => id), [
    ids.localAttachmentId,
    ids.telegramAttachmentId,
  ])
})

test('GET admin/homeworks сохраняет общий и фильтрованный контракты', async () => {
  const all = await app.inject({
    method: 'GET',
    url: `/api/admin/homeworks?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(all.json().data.homeworks.length, 5)
  assert.equal(all.json().data.homeworks[0].id, ids.completedHomeworkId)
  assert.equal(all.json().data.homeworks[0].student_name, 'Completed Profile')

  const filtered = await app.inject({
    method: 'GET',
    url: `/api/admin/homeworks?telegram_id=${adminTelegramId}&student_id=${ids.studentId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.deepEqual(filtered.json().data.homeworks.map(({ id }: { id: number }) => id), [
    ids.pendingHomeworkId,
    ids.revisionHomeworkId,
    ids.approvedHomeworkId,
    ids.documentHomeworkId,
  ])
  assert.equal(Object.hasOwn(filtered.json().data.homeworks[0], 'student_name'), false)

  const emptyFilter = await app.inject({
    method: 'GET',
    url: `/api/admin/homeworks?telegram_id=${adminTelegramId}&student_id=`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(emptyFilter.json().data.homeworks.length, 5)
})

test('GET admin/audit возвращает raw meta и соблюдает limit', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/admin/audit?telegram_id=${adminTelegramId}&limit=1`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.entries, [{
    id: response.json().data.entries[0].id,
    action: 'admin_fixture_new',
    meta: '{"source":"nest"}',
    created_at: '2026-09-23 09:00:00',
    actor_user_id: response.json().data.entries[0].actor_user_id,
    actor_telegram_id: adminTelegramId,
  }])
})

test('административные GET сохраняют validation, auth, role и not-found ошибки', async (context) => {
  for (const url of [
    `/api/admin/feedback?telegram_id=${adminTelegramId}&before=0`,
    `/api/admin/students?telegram_id=${adminTelegramId}&status=unknown`,
    `/api/admin/student/nope?telegram_id=${adminTelegramId}`,
    `/api/admin/homeworks?telegram_id=${adminTelegramId}&student_id=0`,
    `/api/admin/audit?telegram_id=${adminTelegramId}&limit=201`,
  ]) {
    await context.test(`validation: ${url}`, async () => {
      const response = await app.inject({ method: 'GET', url })
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
    })
  }

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/teachers?telegram_id=${adminTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })
  await context.test('не администратор', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/teachers?telegram_id=${studentTelegramId}`,
      headers: authHeaders(studentTelegramId),
    })
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Доступ только для администраторов.',
    })
  })
  await context.test('ученик не найден', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/student/999999?telegram_id=${adminTelegramId}`,
      headers: authHeaders(adminTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Ученик не найден.' })
  })
})
