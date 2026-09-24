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
import { UserNotificationGateway } from '../src/notifications/user-notification.gateway.js'
import { createTestDatabase } from './support/test-database.js'

const botToken = '123456:nest-admin-reads-token'
const adminWebSessionToken = 'nest-admin-reads-web-session'
const adminTelegramId = 8101
const teacherTelegramId = 8201
const studentTelegramId = 8301
const completedStudentTelegramId = 8302
const applicantTelegramId = 8401
const moderationStudentTelegramId = 8501

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
const sentNotifications: Array<{ telegramId: number; message: string }> = []
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
  moderationStudentId: number
  moderationStudentUserId: number
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
  const moderationStudentUserId = Number(
    insertUser.run(moderationStudentTelegramId, 'Moderation', 'Student', 'student').lastInsertRowid,
  )
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
  insertRole.run(adminUserId, 'admin')
  insertRole.run(teacherUserId, 'teacher')
  insertRole.run(studentUserId, 'student')
  insertRole.run(completedUserId, 'student')
  insertRole.run(moderationStudentUserId, 'student')

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
  const moderationStudentId = Number(insertStudent.run(
    moderationStudentUserId,
    'Moderation Student',
    '+70000000005',
    10,
    'moderation',
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
    moderationStudentId,
    moderationStudentUserId,
  }
}

const createTeacherApplication = ({
  telegramId,
  status = 'pending',
  teacherProfile = false,
  teacherRole = false,
}: {
  telegramId: number
  status?: string
  teacherProfile?: boolean
  teacherRole?: boolean
}): { userId: number; applicationId: number; teacherId: number | null } => {
  const db = new Database(databasePath)
  const userId = Number(db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, 'Application', 'Candidate', 'guest')
  `).run(telegramId).lastInsertRowid)
  if (teacherRole) {
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
      .run(userId, 'teacher')
  }
  const teacherId = teacherProfile
    ? Number(db.prepare(`
        INSERT INTO teachers (user_id, full_name)
        VALUES (?, 'Existing Candidate')
      `).run(userId).lastInsertRowid)
    : null
  const applicationId = Number(db.prepare(`
    INSERT INTO teacher_applications
      (applicant_user_id, full_name, phone, status)
    VALUES (?, 'Application Candidate', '+70000000999', ?)
  `).run(userId, status).lastInsertRowid)
  db.close()
  return { userId, applicationId, teacherId }
}

const removeTeacherApplication = (target: {
  userId: number
  applicationId: number
}): void => {
  const db = new Database(databasePath)
  db.prepare(`DELETE FROM audit_log WHERE meta LIKE ?`)
    .run(`%\"application_id\":${target.applicationId}%`)
  db.prepare(`DELETE FROM app_notifications WHERE user_id = ?`).run(target.userId)
  db.prepare(`DELETE FROM teacher_applications WHERE id = ?`).run(target.applicationId)
  db.prepare(`DELETE FROM users WHERE id = ?`).run(target.userId)
  db.close()
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
  const fixture = await createTestDatabase('proof-craft-admin-reads-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  ids = seedAdminReads(databasePath)
  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TG_WEBAPP_AUTH = 'strict'
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(UserNotificationGateway)
    .useValue({
      send: async (telegramId: number, message: string) => {
        sentNotifications.push({ telegramId, message })
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

test('POST admin/teacher-applications одобряет нового преподавателя и уведомляет', async () => {
  const target = createTeacherApplication({ telegramId: 8601 })
  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/teacher-applications',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      application_id: String(target.applicationId),
      action: 'approve',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    data: { status: 'approved' },
  })

  const db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT status FROM teacher_applications WHERE id = ?
  `).get(target.applicationId), { status: 'approved' })
  assert.deepEqual(db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ? AND role = 'teacher'
  `).get(target.userId), { role: 'teacher' })
  assert.deepEqual(db.prepare(`
    SELECT full_name FROM teachers WHERE user_id = ?
  `).get(target.userId), { full_name: 'Application Candidate' })
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'teacher_application_approved',
    meta: JSON.stringify({
      application_id: target.applicationId,
      user_id: target.userId,
    }),
  })
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(target.userId), {
    kind: 'teacher_application_result',
    body: 'Ваша заявка на роль преподавателя одобрена. Откройте мини-приложение снова — доступ «Преподаватель» должен появиться после проверки сессии.',
    payload: JSON.stringify({ application_id: target.applicationId }),
  })
  db.close()
  assert.deepEqual(sentNotifications.at(-1), {
    telegramId: 8601,
    message: 'Ваша заявка на роль преподавателя одобрена. Откройте мини-приложение снова — доступ «Преподаватель» должен появиться после проверки сессии.',
  })
  removeTeacherApplication(target)
})

test('POST admin/teacher-applications отклоняет заявку через web-session', async () => {
  const target = createTeacherApplication({ telegramId: 8602 })
  const notificationCountBefore = sentNotifications.length
  const response = await app.inject({
    method: 'POST',
    url: '/admin/teacher-applications',
    headers: {
      'x-web-session': adminWebSessionToken,
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      application_id: target.applicationId,
      action: 'reject',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), {
    ok: true,
    data: { status: 'rejected' },
  })

  const db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT status FROM teacher_applications WHERE id = ?
  `).get(target.applicationId), { status: 'rejected' })
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'teacher_application_rejected',
    meta: JSON.stringify({ application_id: target.applicationId }),
  })
  assert.equal((db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications WHERE user_id = ?
  `).get(target.userId) as { count: number }).count, 0)
  db.close()
  assert.equal(sentNotifications.length, notificationCountBefore)
  removeTeacherApplication(target)
})

test('POST admin/teacher-applications сохраняет already_teacher и восстанавливает деактивированного', async () => {
  const active = createTeacherApplication({
    telegramId: 8603,
    teacherProfile: true,
    teacherRole: true,
  })
  const inactive = createTeacherApplication({
    telegramId: 8604,
    teacherProfile: true,
  })
  const before = new Database(databasePath, { readonly: true })
  const auditCountBefore = (before.prepare(`
    SELECT COUNT(*) AS count FROM audit_log
  `).get() as { count: number }).count
  before.close()

  const activeResponse = await app.inject({
    method: 'POST',
    url: '/api/admin/teacher-applications',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      application_id: active.applicationId,
      action: 'approve',
    },
  })
  assert.deepEqual(activeResponse.json(), {
    ok: true,
    data: { status: 'approved', already_teacher: true },
  })

  const inactiveResponse = await app.inject({
    method: 'POST',
    url: '/api/admin/teacher-applications',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      application_id: inactive.applicationId,
      action: 'approve',
    },
  })
  assert.deepEqual(inactiveResponse.json(), {
    ok: true,
    data: { status: 'approved' },
  })

  const db = new Database(databasePath, { readonly: true })
  assert.equal((db.prepare(`
    SELECT COUNT(*) AS count FROM audit_log
  `).get() as { count: number }).count, auditCountBefore + 1)
  assert.deepEqual(db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ? AND role = 'teacher'
  `).get(inactive.userId), { role: 'teacher' })
  assert.equal((db.prepare(`
    SELECT COUNT(*) AS count FROM teachers WHERE user_id = ?
  `).get(inactive.userId) as { count: number }).count, 1)
  assert.equal((db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications WHERE user_id = ?
  `).get(active.userId) as { count: number }).count, 0)
  assert.equal((db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications WHERE user_id = ?
  `).get(inactive.userId) as { count: number }).count, 1)
  db.close()
  assert.equal(sentNotifications.at(-1)?.telegramId, 8604)
  removeTeacherApplication(active)
  removeTeacherApplication(inactive)
})

test('POST admin/teacher-applications сохраняет validation, auth и not-found', async (context) => {
  const injectDecision = async (
    payload: Record<string, unknown>,
    telegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/admin/teacher-applications',
    headers: {
      ...(telegramId == null ? {} : authHeaders(telegramId)),
      'content-type': 'application/json',
    },
    payload,
  })
  const valid = {
    telegram_id: adminTelegramId,
    application_id: 999999,
    action: 'approve',
  }

  await context.test('body проверяется до credential', async () => {
    for (const payload of [
      { ...valid, application_id: 0 },
      { ...valid, application_id: 'nope' },
      { ...valid, action: 'archive' },
    ]) {
      const response = await injectDecision(payload)
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), {
        ok: false,
        error: 'Некорректные параметры запроса.',
      })
    }
  })
  assert.equal((await injectDecision(valid)).statusCode, 401)
  assert.equal((await injectDecision(valid, studentTelegramId)).statusCode, 403)

  const nonAdmin = await injectDecision({
    ...valid,
    telegram_id: studentTelegramId,
  }, studentTelegramId)
  assert.equal(nonAdmin.statusCode, 403)
  assert.deepEqual(nonAdmin.json(), {
    ok: false,
    error: 'Доступ только для администраторов.',
  })

  const missing = await injectDecision(valid, adminTelegramId)
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), {
    ok: false,
    error: 'Заявка не найдена или уже обработана.',
  })

  const processed = createTeacherApplication({ telegramId: 8605, status: 'rejected' })
  const alreadyProcessed = await injectDecision({
    ...valid,
    application_id: processed.applicationId,
  }, adminTelegramId)
  assert.equal(alreadyProcessed.statusCode, 404)
  assert.deepEqual(alreadyProcessed.json(), missing.json())
  removeTeacherApplication(processed)
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

test('GET admin/students без status возвращает всех активных учеников, как legacy', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/admin/students?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(
    response.json().data.students.map(({ id, status }: { id: number; status: string }) => ({ id, status })),
    [
      { id: ids.completedStudentId, status: 'completed' },
      { id: ids.studentId, status: 'studying' },
    ],
  )
})

test('GET admin/students точно фильтрует явный status и возвращает агрегаты', async () => {
  const studying = await app.inject({
    method: 'GET',
    url: `/api/admin/students?telegram_id=${adminTelegramId}&status=studying`,
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

test('POST admin/students выполняет модерацию, назначения и уведомления', async () => {
  const actions = [
    {
      payload: {
        telegram_id: adminTelegramId,
        student_id: ids.moderationStudentId,
        action: 'approve',
        teacher_ids: [ids.teacherId, ids.teacherId],
      },
      status: 'studying',
      audit: 'admin_student_approve',
      message: '🎉 Ваша заявка одобрена! Теперь вы можете сдавать домашние задания.',
    },
    {
      payload: {
        telegram_id: adminTelegramId,
        student_id: ids.moderationStudentId,
        action: 'set_completed',
        teacher_ids: [999999],
      },
      status: 'completed',
      audit: 'admin_student_set_completed',
      message: 'Ваш статус обучения обновлен: завершил обучение.',
    },
    {
      payload: {
        telegram_id: adminTelegramId,
        student_id: ids.moderationStudentId,
        action: 'set_studying',
      },
      status: 'studying',
      audit: 'admin_student_set_studying',
      message: 'Ваш статус обучения обновлен: обучается.',
    },
    {
      payload: {
        telegram_id: adminTelegramId,
        student_id: ids.moderationStudentId,
        action: 'reject',
      },
      status: 'rejected',
      audit: 'admin_student_reject',
      message: 'К сожалению, ваша заявка была отклонена.',
    },
  ]

  for (const expected of actions) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/students',
      headers: {
        ...authHeaders(adminTelegramId),
        'content-type': 'application/json',
      },
      payload: expected.payload,
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { ok: true })

    const db = new Database(databasePath, { readonly: true })
    const student = db.prepare('SELECT status FROM students WHERE id = ?')
      .get(ids.moderationStudentId) as { status: string }
    const audit = db.prepare(`
      SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
    `).get()
    const notification = db.prepare(`
      SELECT kind, body, payload FROM app_notifications
      WHERE user_id = ? ORDER BY id DESC LIMIT 1
    `).get(ids.moderationStudentUserId)
    db.close()

    assert.equal(student.status, expected.status)
    assert.deepEqual(audit, {
      action: expected.audit,
      meta: JSON.stringify({
        student_id: ids.moderationStudentId,
        status: expected.status,
      }),
    })
    assert.deepEqual(notification, {
      kind: 'student_status',
      body: expected.message,
      payload: JSON.stringify({
        action: expected.payload.action,
        student_id: ids.moderationStudentId,
      }),
    })
    assert.deepEqual(sentNotifications.at(-1), {
      telegramId: moderationStudentTelegramId,
      message: expected.message,
    })
  }

  const db = new Database(databasePath, { readonly: true })
  const assignments = db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ? ORDER BY teacher_id
  `).all(ids.moderationStudentId)
  db.close()
  assert.deepEqual(assignments, [{ teacher_id: ids.teacherId }])
})

test('POST admin/students поддерживает web-session и nginx-путь', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/admin/students',
    headers: {
      'x-web-session': adminWebSessionToken,
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      student_id: ids.moderationStudentId,
      action: 'set_studying',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })
})

test('POST admin/students сохраняет validation, auth и domain-ошибки', async (context) => {
  const injectModeration = async (
    payload: Record<string, unknown>,
    telegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/admin/students',
    headers: {
      ...(telegramId == null ? {} : authHeaders(telegramId)),
      'content-type': 'application/json',
    },
    payload,
  })
  const valid = {
    telegram_id: adminTelegramId,
    student_id: 999999,
    action: 'approve',
  }

  await context.test('body проверяется до credential', async () => {
    for (const payload of [
      { ...valid, student_id: 0 },
      { ...valid, action: 'archive' },
      { ...valid, teacher_ids: null },
      { ...valid, teacher_ids: [0] },
      { ...valid, teacher_ids: Array.from({ length: 81 }, (_, index) => index + 1) },
    ]) {
      const response = await injectModeration(payload)
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
    }
  })
  await context.test('нет credential', async () => {
    const response = await injectModeration(valid)
    assert.equal(response.statusCode, 401)
  })
  await context.test('credential не совпадает', async () => {
    const response = await injectModeration(valid, studentTelegramId)
    assert.equal(response.statusCode, 403)
  })
  await context.test('пользователь не найден', async () => {
    const response = await injectModeration(
      { telegram_id: 9999, student_id: 999999, action: 'approve' },
      9999,
    )
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })
  await context.test('пользователь не администратор', async () => {
    const response = await injectModeration(
      { telegram_id: studentTelegramId, student_id: 999999, action: 'approve' },
      studentTelegramId,
    )
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Доступ только для администраторов.',
    })
  })
  await context.test('ученик не найден', async () => {
    const response = await injectModeration(valid, adminTelegramId)
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Ученик не найден.' })
  })
  await context.test('преподаватель для approve не найден', async () => {
    const response = await injectModeration(
      {
        telegram_id: adminTelegramId,
        student_id: ids.moderationStudentId,
        action: 'approve',
        teacher_ids: [999999],
      },
      adminTelegramId,
    )
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Преподаватель с id 999999 не найден.',
    })
  })
})

test('POST admin/teachers сохраняет validation, auth и domain-ошибки', async (context) => {
  const injectRoleChange = async (
    payload: Record<string, unknown>,
    telegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/admin/teachers',
    headers: {
      ...(telegramId == null ? {} : authHeaders(telegramId)),
      'content-type': 'application/json',
    },
    payload,
  })
  const valid = {
    telegram_id: adminTelegramId,
    target_telegram_id: 999999,
    action: 'assign',
  }

  await context.test('body проверяется до credential', async () => {
    for (const payload of [
      { ...valid, target_telegram_id: 0 },
      { ...valid, action: 'archive' },
      { ...valid, full_name: null },
    ]) {
      const response = await injectRoleChange(payload)
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), {
        ok: false,
        error: 'Некорректные параметры запроса.',
      })
    }
  })
  assert.equal((await injectRoleChange(valid)).statusCode, 401)
  assert.equal((await injectRoleChange(valid, studentTelegramId)).statusCode, 403)

  const nonAdmin = await injectRoleChange({
    telegram_id: studentTelegramId,
    target_telegram_id: 999999,
    action: 'assign',
  }, studentTelegramId)
  assert.equal(nonAdmin.statusCode, 403)
  assert.deepEqual(nonAdmin.json(), {
    ok: false,
    error: 'Доступ только для администраторов.',
  })

  const missing = await injectRoleChange(valid, adminTelegramId)
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), {
    ok: false,
    error: 'Пользователь не найден. Попросите его отправить /start боту.',
  })
})

test('POST admin/teachers деактивирует роль без потери профиля и истории', async () => {
  const assignedMessage =
    'Вам назначена роль преподавателя. Откройте мини-приложение для проверки работ.'
  const removedMessage =
    'Роль преподавателя снята. Если это ошибка — свяжитесь с администратором.'

  const assignExisting = await app.inject({
    method: 'POST',
    url: '/api/admin/teachers',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      target_telegram_id: String(teacherTelegramId),
      action: 'assign',
      full_name: 'Не должно перезаписаться',
    },
  })
  assert.equal(assignExisting.statusCode, 200)
  assert.deepEqual(assignExisting.json(), { ok: true })

  const remove = await app.inject({
    method: 'POST',
    url: '/admin/teachers',
    headers: {
      'x-web-session': adminWebSessionToken,
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      target_telegram_id: teacherTelegramId,
      action: 'remove',
    },
  })
  assert.equal(remove.statusCode, 200)
  assert.deepEqual(remove.json(), { ok: true })

  let db = new Database(databasePath, { readonly: true })
  const teacherAfterRemoval = db.prepare(`
    SELECT id, full_name FROM teachers WHERE id = ?
  `).get(ids.teacherId)
  const roleAfterRemoval = db.prepare(`
    SELECT 1 FROM user_roles ur
    JOIN teachers t ON t.user_id = ur.user_id
    WHERE t.id = ? AND ur.role = 'teacher'
  `).get(ids.teacherId)
  const assignmentsAfterRemoval = db.prepare(`
    SELECT COUNT(*) AS count FROM student_teachers WHERE teacher_id = ?
  `).get(ids.teacherId) as { count: number }
  const reviewsAfterRemoval = db.prepare(`
    SELECT COUNT(*) AS count FROM homework_reviews WHERE teacher_id = ?
  `).get(ids.teacherId) as { count: number }
  const auditAfterRemoval = db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notificationAfterRemoval = db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = (SELECT user_id FROM teachers WHERE id = ?)
    ORDER BY id DESC LIMIT 1
  `).get(ids.teacherId)
  db.close()

  assert.deepEqual(teacherAfterRemoval, {
    id: ids.teacherId,
    full_name: '  Teacher   Profile  ',
  })
  assert.equal(roleAfterRemoval, undefined)
  assert.equal(assignmentsAfterRemoval.count, 0)
  assert.equal(reviewsAfterRemoval.count, 3)
  assert.deepEqual(auditAfterRemoval, {
    action: 'admin_teacher_remove',
    meta: JSON.stringify({ target_telegram_id: teacherTelegramId }),
  })
  assert.deepEqual(notificationAfterRemoval, {
    kind: 'teacher_role_removed',
    body: removedMessage,
    payload: '{}',
  })
  assert.deepEqual(sentNotifications.at(-1), {
    telegramId: teacherTelegramId,
    message: removedMessage,
  })

  const hidden = await app.inject({
    method: 'GET',
    url: `/api/admin/teachers?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(hidden.statusCode, 200)
  assert.deepEqual(hidden.json().data.teachers, [])

  const denied = await app.inject({
    method: 'GET',
    url: `/api/teacher/dashboard?telegram_id=${teacherTelegramId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(denied.statusCode, 403)
  assert.deepEqual(denied.json(), {
    ok: false,
    error: 'Доступ только для преподавателей.',
  })

  const session = await app.inject({
    method: 'GET',
    url: `/api/session?telegram_id=${teacherTelegramId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(session.statusCode, 200)
  assert.equal(session.json().data.isTeacher, false)
  assert.equal(session.json().data.teacher, null)

  const assignAgain = await app.inject({
    method: 'POST',
    url: '/api/admin/teachers',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      target_telegram_id: teacherTelegramId,
      action: 'assign',
    },
  })
  assert.equal(assignAgain.statusCode, 200)
  assert.deepEqual(assignAgain.json(), { ok: true })

  db = new Database(databasePath, { readonly: true })
  const restoredRole = db.prepare(`
    SELECT role FROM user_roles ur
    JOIN teachers t ON t.user_id = ur.user_id
    WHERE t.id = ? AND ur.role = 'teacher'
  `).get(ids.teacherId)
  const restoredTeacher = db.prepare(`
    SELECT id, full_name FROM teachers WHERE id = ?
  `).get(ids.teacherId)
  const restoredReviews = db.prepare(`
    SELECT COUNT(*) AS count FROM homework_reviews WHERE teacher_id = ?
  `).get(ids.teacherId) as { count: number }
  db.close()
  assert.deepEqual(restoredRole, { role: 'teacher' })
  assert.deepEqual(restoredTeacher, teacherAfterRemoval)
  assert.equal(restoredReviews.count, 3)
  assert.deepEqual(sentNotifications.at(-1), {
    telegramId: teacherTelegramId,
    message: assignedMessage,
  })
})

test('POST admin assign/unassign меняет связь идемпотентно и уведомляет обе стороны', async () => {
  const payload = {
    telegram_id: adminTelegramId,
    teacher_id: ids.teacherId,
    student_id: ids.completedStudentId,
  }
  const teacherMessage = 'К вам прикреплён ученик: Completed Profile.'
  const studentMessage = 'Вас прикрепили к преподавателю:   Teacher   Profile  .'

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/assign-student',
      headers: {
        ...authHeaders(adminTelegramId),
        'content-type': 'application/json',
      },
      payload,
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { ok: true })
  }

  let db = new Database(databasePath, { readonly: true })
  const assignedCount = db.prepare(`
    SELECT COUNT(*) AS count FROM student_teachers
    WHERE student_id = ? AND teacher_id = ?
  `).get(ids.completedStudentId, ids.teacherId) as { count: number }
  assert.equal(assignedCount.count, 1)
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_assign_student',
    meta: JSON.stringify({
      teacher_id: ids.teacherId,
      student_id: ids.completedStudentId,
    }),
  })
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = (SELECT user_id FROM teachers WHERE id = ?)
    ORDER BY id DESC LIMIT 1
  `).get(ids.teacherId), {
    kind: 'student_assigned',
    body: teacherMessage,
    payload: JSON.stringify({
      student_id: ids.completedStudentId,
      teacher_id: ids.teacherId,
    }),
  })
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = (SELECT user_id FROM students WHERE id = ?)
    ORDER BY id DESC LIMIT 1
  `).get(ids.completedStudentId), {
    kind: 'teacher_assigned',
    body: studentMessage,
    payload: JSON.stringify({
      student_id: ids.completedStudentId,
      teacher_id: ids.teacherId,
    }),
  })
  db.close()
  assert.deepEqual(sentNotifications.slice(-2), [
    { telegramId: teacherTelegramId, message: teacherMessage },
    { telegramId: completedStudentTelegramId, message: studentMessage },
  ])

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: attempt === 0
        ? '/admin/unassign-student'
        : '/api/admin/unassign-student',
      headers: attempt === 0
        ? {
            'x-web-session': adminWebSessionToken,
            'content-type': 'application/json',
          }
        : {
            ...authHeaders(adminTelegramId),
            'content-type': 'application/json',
          },
      payload,
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { ok: true })
  }

  db = new Database(databasePath, { readonly: true })
  const unassignedCount = db.prepare(`
    SELECT COUNT(*) AS count FROM student_teachers
    WHERE student_id = ? AND teacher_id = ?
  `).get(ids.completedStudentId, ids.teacherId) as { count: number }
  assert.equal(unassignedCount.count, 0)
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_unassign_student',
    meta: JSON.stringify({
      teacher_id: ids.teacherId,
      student_id: ids.completedStudentId,
    }),
  })
  db.close()
  assert.deepEqual(sentNotifications.slice(-2), [
    {
      telegramId: teacherTelegramId,
      message: 'Ученик Completed Profile снят с вашего ведения.',
    },
    {
      telegramId: completedStudentTelegramId,
      message: 'Преподаватель   Teacher   Profile   снят с вашего обучения.',
    },
  ])
})

test('POST admin/assign-student не создаёт связь для уровня barber', async () => {
  const db = new Database(databasePath)
  db.prepare(`
    UPDATE students SET status = 'studying', student_track = 'barber' WHERE id = ?
  `).run(ids.moderationStudentId)
  db.close()

  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/assign-student',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      teacher_id: ids.teacherId,
      student_id: ids.moderationStudentId,
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const verification = new Database(databasePath)
  const assignmentCount = verification.prepare(`
    SELECT COUNT(*) AS count FROM student_teachers
    WHERE student_id = ? AND teacher_id = ?
  `).get(ids.moderationStudentId, ids.teacherId) as { count: number }
  assert.equal(assignmentCount.count, 0)
  assert.deepEqual(verification.prepare(`
    SELECT kind, payload FROM app_notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(ids.moderationStudentUserId), {
    kind: 'teacher_assigned',
    payload: JSON.stringify({
      student_id: ids.moderationStudentId,
      teacher_id: ids.teacherId,
    }),
  })
  verification.prepare(`
    UPDATE students SET student_track = 'student' WHERE id = ?
  `).run(ids.moderationStudentId)
  verification.close()
})

test('POST admin assignment сохраняет validation, auth и domain-ошибки', async (context) => {
  const injectAssignment = async (
    path: string,
    payload: Record<string, unknown>,
    telegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: path,
    headers: {
      ...(telegramId == null ? {} : authHeaders(telegramId)),
      'content-type': 'application/json',
    },
    payload,
  })
  const valid = {
    telegram_id: adminTelegramId,
    teacher_id: ids.teacherId,
    student_id: ids.completedStudentId,
  }

  for (const path of ['/api/admin/assign-student', '/api/admin/unassign-student']) {
    await context.test(`${path}: body проверяется до credential`, async () => {
      for (const payload of [
        { ...valid, teacher_id: 0 },
        { ...valid, student_id: 'nope' },
      ]) {
        const response = await injectAssignment(path, payload)
        assert.equal(response.statusCode, 400)
        assert.deepEqual(response.json(), {
          ok: false,
          error: 'Некорректные параметры запроса.',
        })
      }
    })
  }
  assert.equal((await injectAssignment('/api/admin/assign-student', valid)).statusCode, 401)
  assert.equal(
    (await injectAssignment('/api/admin/assign-student', valid, studentTelegramId)).statusCode,
    403,
  )
  const nonAdmin = await injectAssignment('/api/admin/unassign-student', {
    ...valid,
    telegram_id: studentTelegramId,
  }, studentTelegramId)
  assert.equal(nonAdmin.statusCode, 403)
  assert.deepEqual(nonAdmin.json(), {
    ok: false,
    error: 'Доступ только для администраторов.',
  })

  const missingTeacher = await injectAssignment('/api/admin/assign-student', {
    ...valid,
    teacher_id: 999999,
  }, adminTelegramId)
  assert.equal(missingTeacher.statusCode, 404)
  assert.deepEqual(missingTeacher.json(), {
    ok: false,
    error: 'Преподаватель не найден.',
  })

  const missingStudent = await injectAssignment('/api/admin/assign-student', {
    ...valid,
    student_id: 999999,
  }, adminTelegramId)
  assert.equal(missingStudent.statusCode, 404)
  assert.deepEqual(missingStudent.json(), {
    ok: false,
    error: 'Ученик не найден или не в статусе "обучается/завершил обучение".',
  })

  const missingPair = await injectAssignment('/api/admin/unassign-student', {
    ...valid,
    teacher_id: 999999,
  }, adminTelegramId)
  assert.equal(missingPair.statusCode, 404)
  assert.deepEqual(missingPair.json(), {
    ok: false,
    error: 'Преподаватель или ученик не найден.',
  })

  const db = new Database(databasePath)
  db.prepare(`
    DELETE FROM user_roles
    WHERE user_id = (SELECT user_id FROM teachers WHERE id = ?) AND role = 'teacher'
  `).run(ids.teacherId)
  db.close()
  const inactive = await injectAssignment('/api/admin/assign-student', valid, adminTelegramId)
  assert.equal(inactive.statusCode, 404)
  assert.deepEqual(inactive.json(), {
    ok: false,
    error: 'Преподаватель не найден.',
  })
  const cleanup = new Database(databasePath)
  cleanup.prepare(`
    INSERT INTO user_roles (user_id, role)
    SELECT user_id, 'teacher' FROM teachers WHERE id = ?
  `).run(ids.teacherId)
  cleanup.close()
})

test('POST admin/update-student обновляет профиль и заменяет назначения', async () => {
  const setup = new Database(databasePath)
  setup.prepare(`
    UPDATE students
    SET lessons_count = 15, student_track = 'student', status = 'completed'
    WHERE id = ?
  `).run(ids.completedStudentId)
  setup.prepare(`
    INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)
  `).run(ids.completedStudentId, ids.teacherId)
  setup.close()

  const update = await app.inject({
    method: 'POST',
    url: '/api/admin/update-student',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      student_id: String(ids.completedStudentId),
      lessons_count: '18',
      student_track: 'intern',
      teacher_ids: [String(ids.teacherId), ids.teacherId],
    },
  })
  assert.equal(update.statusCode, 200)
  assert.deepEqual(update.json(), { ok: true })

  let db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT lessons_count, student_track FROM students WHERE id = ?
  `).get(ids.completedStudentId), {
    lessons_count: 18,
    student_track: 'intern',
  })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ? ORDER BY teacher_id
  `).all(ids.completedStudentId), [{ teacher_id: ids.teacherId }])
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_update_student',
    meta: JSON.stringify({
      student_id: ids.completedStudentId,
      lessons_count: 18,
      student_track: 'intern',
      teacher_ids: [ids.teacherId, ids.teacherId],
    }),
  })
  db.close()

  const clear = await app.inject({
    method: 'POST',
    url: '/admin/update-student',
    headers: {
      'x-web-session': adminWebSessionToken,
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      student_id: ids.completedStudentId,
      teacher_ids: [],
    },
  })
  assert.equal(clear.statusCode, 200)
  assert.deepEqual(clear.json(), { ok: true })

  const noop = await app.inject({
    method: 'POST',
    url: '/api/admin/update-student',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      student_id: ids.completedStudentId,
    },
  })
  assert.equal(noop.statusCode, 200)
  assert.deepEqual(noop.json(), { ok: true })

  db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(ids.completedStudentId), [])
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_update_student',
    meta: JSON.stringify({
      student_id: ids.completedStudentId,
      lessons_count: null,
      student_track: null,
      teacher_ids: null,
    }),
  })
  db.close()
})

test('POST admin/update-student снимает назначения при переходе в barber', async () => {
  const setup = new Database(databasePath)
  setup.prepare(`
    INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)
  `).run(ids.completedStudentId, ids.teacherId)
  setup.close()

  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/update-student',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      student_id: ids.completedStudentId,
      student_track: 'barber',
      teacher_ids: [ids.teacherId],
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  assert.equal((db.prepare(`
    SELECT student_track FROM students WHERE id = ?
  `).get(ids.completedStudentId) as { student_track: string }).student_track, 'barber')
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(ids.completedStudentId), [])
  db.close()
})

test('POST admin/update-student сохраняет partial-write BUG-003 перед domain-ошибкой', async () => {
  const setup = new Database(databasePath)
  setup.prepare(`
    UPDATE students
    SET lessons_count = 10, student_track = 'student', status = 'moderation'
    WHERE id = ?
  `).run(ids.moderationStudentId)
  setup.prepare(`
    INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)
  `).run(ids.moderationStudentId, ids.teacherId)
  setup.prepare(`
    UPDATE students
    SET lessons_count = 15, student_track = 'student', status = 'completed'
    WHERE id = ?
  `).run(ids.completedStudentId)
  setup.prepare(`
    INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)
  `).run(ids.completedStudentId, ids.teacherId)
  const auditCountBefore = setup.prepare(`
    SELECT COUNT(*) AS count FROM audit_log
    WHERE action = 'admin_update_student'
      AND json_extract(meta, '$.student_id') IN (?, ?)
  `).get(ids.moderationStudentId, ids.completedStudentId) as { count: number }
  setup.close()

  const invalidStatus = await app.inject({
    method: 'POST',
    url: '/api/admin/update-student',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      student_id: ids.moderationStudentId,
      lessons_count: 9,
      student_track: 'barber',
      teacher_ids: [ids.teacherId],
    },
  })
  assert.equal(invalidStatus.statusCode, 400)
  assert.deepEqual(invalidStatus.json(), {
    ok: false,
    error: 'Назначать преподавателей можно только при статусе «обучается» или «завершил».',
  })

  const invalidTeacher = await app.inject({
    method: 'POST',
    url: '/api/admin/update-student',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: adminTelegramId,
      student_id: ids.completedStudentId,
      lessons_count: 8,
      student_track: 'intern',
      teacher_ids: [999999],
    },
  })
  assert.equal(invalidTeacher.statusCode, 400)
  assert.deepEqual(invalidTeacher.json(), {
    ok: false,
    error: 'Преподаватель с id 999999 не найден.',
  })

  const db = new Database(databasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT lessons_count, student_track FROM students WHERE id = ?
  `).get(ids.moderationStudentId), {
    lessons_count: 9,
    student_track: 'barber',
  })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(ids.moderationStudentId), [])
  assert.deepEqual(db.prepare(`
    SELECT lessons_count, student_track FROM students WHERE id = ?
  `).get(ids.completedStudentId), {
    lessons_count: 8,
    student_track: 'intern',
  })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(ids.completedStudentId), [{ teacher_id: ids.teacherId }])
  const auditCountAfter = db.prepare(`
    SELECT COUNT(*) AS count FROM audit_log
    WHERE action = 'admin_update_student'
      AND json_extract(meta, '$.student_id') IN (?, ?)
  `).get(ids.moderationStudentId, ids.completedStudentId) as { count: number }
  assert.equal(auditCountAfter.count, auditCountBefore.count)
  db.close()
})

test('POST admin/update-student сохраняет validation, auth и domain-ошибки', async (context) => {
  const injectUpdate = async (
    payload: Record<string, unknown>,
    telegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/admin/update-student',
    headers: {
      ...(telegramId == null ? {} : authHeaders(telegramId)),
      'content-type': 'application/json',
    },
    payload,
  })
  const valid = { telegram_id: adminTelegramId, student_id: 999999 }

  await context.test('body проверяется до credential', async () => {
    for (const payload of [
      { ...valid, student_id: 0 },
      { ...valid, lessons_count: -1 },
      { ...valid, lessons_count: 1.5 },
      { ...valid, student_track: 'master' },
      { ...valid, teacher_ids: null },
      { ...valid, teacher_ids: [0] },
    ]) {
      const response = await injectUpdate(payload)
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), {
        ok: false,
        error: 'Некорректные параметры запроса.',
      })
    }
  })
  assert.equal((await injectUpdate(valid)).statusCode, 401)
  assert.equal((await injectUpdate(valid, studentTelegramId)).statusCode, 403)

  const nonAdmin = await injectUpdate({
    telegram_id: studentTelegramId,
    student_id: 999999,
  }, studentTelegramId)
  assert.equal(nonAdmin.statusCode, 403)
  assert.deepEqual(nonAdmin.json(), {
    ok: false,
    error: 'Доступ только для администраторов.',
  })

  const missing = await injectUpdate(valid, adminTelegramId)
  assert.equal(missing.statusCode, 404)
  assert.deepEqual(missing.json(), { ok: false, error: 'Ученик не найден.' })

  const deactivate = new Database(databasePath)
  deactivate.prepare(`
    DELETE FROM user_roles
    WHERE user_id = (SELECT user_id FROM teachers WHERE id = ?) AND role = 'teacher'
  `).run(ids.teacherId)
  deactivate.close()
  const inactiveTeacher = await injectUpdate({
    telegram_id: adminTelegramId,
    student_id: ids.completedStudentId,
    lessons_count: 7,
    teacher_ids: [ids.teacherId],
  }, adminTelegramId)
  assert.equal(inactiveTeacher.statusCode, 400)
  assert.deepEqual(inactiveTeacher.json(), {
    ok: false,
    error: `Преподаватель с id ${ids.teacherId} не найден.`,
  })
  const restore = new Database(databasePath)
  assert.equal((restore.prepare(`
    SELECT lessons_count FROM students WHERE id = ?
  `).get(ids.completedStudentId) as { lessons_count: number }).lessons_count, 7)
  restore.prepare(`
    INSERT INTO user_roles (user_id, role)
    SELECT user_id, 'teacher' FROM teachers WHERE id = ?
  `).run(ids.teacherId)
  restore.close()
})
