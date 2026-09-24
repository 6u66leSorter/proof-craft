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
const sentNotifications: Array<{ telegramId: number; message: string }> = []
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

const createPendingHomework = ({
  studentId,
  lessonNumber,
  isBonus = 0,
}: {
  studentId: number
  lessonNumber: number
  isBonus?: number
}): number => {
  const db = new Database(databasePath)
  const id = Number(db.prepare(`
    INSERT INTO homeworks
      (student_id, lesson_number, is_bonus, content_type, text_content, status, haircut_name)
    VALUES (?, ?, ?, 'text', ?, 'pending', 'Контрактная работа')
  `).run(
    studentId,
    lessonNumber,
    isBonus,
    `Работа для проверки ${lessonNumber}`,
  ).lastInsertRowid)
  db.close()
  return id
}

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-teacher-cabinet-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  ids = seedTeacherCabinet(databasePath)
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

test('POST teacher/review принимает работу и атомарно создаёт побочные эффекты', async () => {
  const homeworkId = createPendingHomework({
    studentId: ids.assignedStudentId,
    lessonNumber: 5,
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/teacher/review',
    headers: {
      ...authHeaders(teacherTelegramId),
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: teacherTelegramId,
      homework_id: homeworkId,
      rating: '5',
      comment: '  Отличная техника  ',
    },
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), { ok: true })

  const db = new Database(databasePath, { readonly: true })
  const homework = db.prepare('SELECT status FROM homeworks WHERE id = ?').get(homeworkId) as {
    status: string
  }
  const review = db.prepare(`
    SELECT teacher_id, rating, comment, status
    FROM homework_reviews WHERE homework_id = ? ORDER BY id DESC LIMIT 1
  `).get(homeworkId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log
    WHERE action = 'teacher_review_homework' ORDER BY id DESC LIMIT 1
  `).get()
  const chat = db.prepare(`
    SELECT student_id, text_content, content_type
    FROM chat_messages WHERE student_id = ? ORDER BY id DESC LIMIT 1
  `).get(ids.assignedStudentId)
  const notifications = db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = (SELECT user_id FROM students WHERE id = ?)
      AND kind IN ('homework_review', 'feedback_invite')
    ORDER BY id DESC LIMIT 2
  `).all(ids.assignedStudentId)
  const invite = db.prepare(`
    SELECT student_id, milestone, delivery_status
    FROM feedback_invites WHERE student_id = ? AND milestone = 5
  `).get(ids.assignedStudentId)
  db.close()

  assert.equal(homework.status, 'approved')
  assert.deepEqual(review, {
    teacher_id: ids.teacherId,
    rating: 5,
    comment: 'Отличная техника',
    status: 'approved',
  })
  assert.deepEqual(audit, {
    action: 'teacher_review_homework',
    meta: JSON.stringify({ homework_id: homeworkId, status: 'approved' }),
  })
  assert.deepEqual(chat, {
    student_id: ids.assignedStudentId,
    text_content: '✅ Проверка ДЗ (урок №5): принято. Оценка: 5/5. Комментарий: Отличная техника',
    content_type: 'system',
  })
  assert.deepEqual(notifications, [
    {
      kind: 'homework_review',
      body: 'Задание по урок №5 принято. Оценка: 5 из 5.\nКомментарий: Отличная техника',
      payload: JSON.stringify({ homework_id: homeworkId, status: 'approved' }),
    },
    {
      kind: 'feedback_invite',
      body: 'Урок №5 принят. Расскажите администратору, как проходит обучение. Отзыв недоступен преподавателю.',
      payload: JSON.stringify({ screen: 'feedback' }),
    },
  ])
  assert.deepEqual(invite, {
    student_id: ids.assignedStudentId,
    milestone: 5,
    delivery_status: 'pending',
  })
  assert.deepEqual(sentNotifications.at(-1), {
    telegramId: assignedStudentTelegramId,
    message: '✅ Твое задание по урок №5 проверено.\nОценка: ⭐⭐⭐⭐⭐\nКомментарий: Отличная техника',
  })
})

test('POST teacher/review возвращает работу на доработку по комментарию', async () => {
  const homeworkId = createPendingHomework({
    studentId: ids.assignedStudentId,
    lessonNumber: 6,
  })
  const response = await app.inject({
    method: 'POST',
    url: '/teacher/review',
    headers: {
      'x-web-session': teacherWebSessionToken,
      'content-type': 'application/json',
    },
    payload: {
      telegram_id: teacherTelegramId,
      homework_id: homeworkId,
      comment: '  Исправьте форму  ',
    },
  })
  assert.equal(response.statusCode, 200)

  const db = new Database(databasePath, { readonly: true })
  const homework = db.prepare('SELECT status FROM homeworks WHERE id = ?').get(homeworkId) as {
    status: string
  }
  const review = db.prepare(`
    SELECT rating, comment, status FROM homework_reviews WHERE homework_id = ?
  `).get(homeworkId)
  const notification = db.prepare(`
    SELECT body, payload FROM app_notifications
    WHERE kind = 'homework_review' AND payload LIKE ? ORDER BY id DESC LIMIT 1
  `).get(`%\"homework_id\":${homeworkId}%`)
  db.close()

  assert.equal(homework.status, 'revision')
  assert.deepEqual(review, {
    rating: null,
    comment: 'Исправьте форму',
    status: 'rejected',
  })
  assert.deepEqual(notification, {
    body: 'Задание по урок №6 нужно доработать.\nКомментарий: Исправьте форму',
    payload: JSON.stringify({ homework_id: homeworkId, status: 'revision' }),
  })
})

test('POST teacher/review позволяет администратору проверить любого активного ученика', async () => {
  const homeworkId = createPendingHomework({
    studentId: ids.unassignedStudentId,
    lessonNumber: 7,
    isBonus: 1,
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/teacher/review',
    headers: {
      ...authHeaders(adminTelegramId),
      'content-type': 'application/json',
    },
    payload: { telegram_id: adminTelegramId, homework_id: homeworkId, rating: 4 },
  })
  assert.equal(response.statusCode, 200)

  const db = new Database(databasePath, { readonly: true })
  const teacher = db.prepare(`
    SELECT t.full_name, t.user_id
    FROM teachers t JOIN users u ON u.id = t.user_id
    WHERE u.telegram_id = ?
  `).get(adminTelegramId) as { full_name: string; user_id: number }
  const review = db.prepare(`
    SELECT hr.rating, hr.status, t.user_id AS teacher_user_id
    FROM homework_reviews hr JOIN teachers t ON t.id = hr.teacher_id
    WHERE hr.homework_id = ?
  `).get(homeworkId) as {
    rating: number
    status: string
    teacher_user_id: number
  }
  const invite = db.prepare(`
    SELECT id FROM feedback_invites WHERE student_id = ? AND milestone = 7
  `).get(ids.unassignedStudentId)
  db.close()

  assert.equal(teacher.full_name, 'Админ Тестовый')
  assert.equal(review.rating, 4)
  assert.equal(review.status, 'approved')
  assert.equal(review.teacher_user_id, teacher.user_id)
  assert.equal(invite, undefined)
})

test('повторный milestone создаёт только одно приглашение к отзыву', async () => {
  const homeworkId = createPendingHomework({
    studentId: ids.assignedStudentId,
    lessonNumber: 5,
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/teacher/review',
    headers: {
      ...authHeaders(teacherTelegramId),
      'content-type': 'application/json',
    },
    payload: { telegram_id: teacherTelegramId, homework_id: homeworkId, rating: 4 },
  })
  assert.equal(response.statusCode, 200)

  const db = new Database(databasePath, { readonly: true })
  const inviteCount = (db.prepare(`
    SELECT COUNT(*) AS count FROM feedback_invites
    WHERE student_id = ? AND milestone = 5
  `).get(ids.assignedStudentId) as { count: number }).count
  const notificationCount = (db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications
    WHERE user_id = (SELECT user_id FROM students WHERE id = ?)
      AND kind = 'feedback_invite'
  `).get(ids.assignedStudentId) as { count: number }).count
  db.close()
  assert.equal(inviteCount, 1)
  assert.equal(notificationCount, 1)
})

test('POST teacher/review сохраняет validation, auth и domain-ошибки', async (context) => {
  const injectReview = async (
    payload: Record<string, unknown>,
    telegramId?: number,
  ) => await app.inject({
    method: 'POST',
    url: '/api/teacher/review',
    headers: {
      ...(telegramId == null ? {} : authHeaders(telegramId)),
      'content-type': 'application/json',
    },
    payload,
  })

  await context.test('body проверяется до credential', async () => {
    for (const payload of [
      { telegram_id: teacherTelegramId, homework_id: 0, rating: 5 },
      { telegram_id: teacherTelegramId, homework_id: 1, rating: 6 },
      { telegram_id: teacherTelegramId, homework_id: 1, comment: 123 },
    ]) {
      const response = await injectReview(payload)
      assert.equal(response.statusCode, 400)
      assert.deepEqual(response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
    }
  })
  await context.test('нет credential', async () => {
    const response = await injectReview({
      telegram_id: teacherTelegramId,
      homework_id: 999999,
      rating: 5,
    })
    assert.equal(response.statusCode, 401)
  })
  await context.test('пользователь не найден', async () => {
    const response = await injectReview(
      { telegram_id: 9999, homework_id: 999999, rating: 5 },
      9999,
    )
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })
  await context.test('пользователь не преподаватель', async () => {
    const response = await injectReview(
      { telegram_id: ordinaryUserTelegramId, homework_id: 999999, rating: 5 },
      ordinaryUserTelegramId,
    )
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Доступ только для преподавателей.',
    })
  })
  await context.test('задание не найдено', async () => {
    const response = await injectReview(
      { telegram_id: teacherTelegramId, homework_id: 999999, rating: 5 },
      teacherTelegramId,
    )
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Задание не найдено.' })
  })
  await context.test('задание уже проверено', async () => {
    const response = await injectReview(
      { telegram_id: teacherTelegramId, homework_id: ids.approvedId, rating: 5 },
      teacherTelegramId,
    )
    assert.equal(response.statusCode, 409)
    assert.deepEqual(response.json(), { ok: false, error: 'Это задание уже проверено.' })
  })
  await context.test('ученик не назначен преподавателю', async () => {
    const homeworkId = createPendingHomework({
      studentId: ids.unassignedStudentId,
      lessonNumber: 8,
    })
    const response = await injectReview(
      { telegram_id: teacherTelegramId, homework_id: homeworkId, rating: 5 },
      teacherTelegramId,
    )
    assert.equal(response.statusCode, 403)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Ученик не прикреплён к этому преподавателю.',
    })
  })
  await context.test('нужна оценка или непустой комментарий', async () => {
    const homeworkId = createPendingHomework({
      studentId: ids.assignedStudentId,
      lessonNumber: 9,
    })
    const response = await injectReview(
      { telegram_id: teacherTelegramId, homework_id: homeworkId, comment: '   ' },
      teacherTelegramId,
    )
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Укажите оценку или напишите комментарий.',
    })
  })
})
