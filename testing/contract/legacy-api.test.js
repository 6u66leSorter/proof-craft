import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'

const testFileDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(testFileDir, '..', '..')

let apiProcess
let baseUrl
let temporaryRoot
let legacyDatabasePath
let serverOutput = ''
const testBotToken = '123456:test-contract-token'
const testVkSecret = 'legacy-contract-vk-secret'
const testWebSessionToken = 'legacy-contract-web-session'
const testTeacherWebSessionToken = 'legacy-contract-teacher-web-session'
const testAdminWebSessionToken = 'legacy-contract-admin-web-session'
const testImageSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'

const findFreePort = async () =>
  await new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => resolvePort(address.port))
    })
  })

const waitForHealth = async () => {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (apiProcess.exitCode != null) {
      throw new Error(`Legacy API завершился до запуска.\n${serverOutput}`)
    }
    try {
      const response = await fetch(`${baseUrl}/health`)
      if (response.ok) return
    } catch {
      // Сервер ещё запускается.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50))
  }
  throw new Error(`Legacy API не запустился за 10 секунд.\n${serverOutput}`)
}

const seedLegacyDatabase = (databasePath) => {
  const db = new Database(databasePath)
  const uploadsDir = join(dirname(databasePath), 'uploads')
  mkdirSync(uploadsDir, { recursive: true })
  const approvedFilePath = join(uploadsDir, 'approved.txt')
  const avatarFilePath = join(uploadsDir, 'avatar.jpg')
  const pendingFilePath = join(uploadsDir, 'pending.txt')
  const revisionFilePath = join(uploadsDir, 'revision.svg')
  const secondStudentFilePath = join(uploadsDir, 'second-student.txt')
  writeFileSync(approvedFilePath, 'approved file')
  writeFileSync(avatarFilePath, 'avatar file')
  writeFileSync(pendingFilePath, testImageSvg)
  writeFileSync(revisionFilePath, testImageSvg)
  writeFileSync(secondStudentFilePath, 'second student file')
  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, ?, ?, ?)
  `)
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')

  const adminUserId = Number(insertUser.run(1001, 'Админ', 'Тестовый', 'admin').lastInsertRowid)
  const teacherUserId = Number(insertUser.run(2001, 'Ирина', 'Преподаватель', 'teacher').lastInsertRowid)
  const studentOneUserId = Number(insertUser.run(3001, 'Анна', 'Ученица', 'student').lastInsertRowid)
  const studentTwoUserId = Number(insertUser.run(3002, 'Мария', 'Ученица', 'student').lastInsertRowid)
  const teacherApplicantUserId = Number(
    insertUser.run(4001, 'Олег', 'Кандидат', 'guest').lastInsertRowid,
  )

  insertRole.run(adminUserId, 'admin')
  insertRole.run(teacherUserId, 'teacher')
  insertRole.run(studentOneUserId, 'student')
  insertRole.run(studentTwoUserId, 'student')

  const teacherId = Number(
    db.prepare('INSERT INTO teachers (user_id, full_name) VALUES (?, ?)')
      .run(teacherUserId, 'Ирина Преподаватель').lastInsertRowid,
  )
  const insertStudent = db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status, metro)
    VALUES (?, ?, ?, ?, 'studying', ?)
  `)
  const studentOneId = Number(
    insertStudent.run(studentOneUserId, 'Анна Ученица', '+79990000001', 10, 'Центральная').lastInsertRowid,
  )
  const studentTwoId = Number(
    insertStudent.run(studentTwoUserId, 'Мария Ученица', '+79990000002', 10, 'Северная').lastInsertRowid,
  )

  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
    .run(studentOneId, teacherId)

  const insertHomework = db.prepare(`
    INSERT INTO homeworks
      (student_id, lesson_number, is_bonus, content_type, file_id, text_content, status, haircut_name)
    VALUES (?, ?, 0, ?, ?, ?, ?, ?)
  `)
  const approvedHomeworkId = Number(
    insertHomework.run(studentOneId, 1, 'photo', approvedFilePath, 'Одобренная работа', 'approved', 'Фейд').lastInsertRowid,
  )
  const pendingHomeworkId = Number(
    insertHomework.run(studentOneId, 2, 'photo', pendingFilePath, 'Работа на проверке', 'pending', 'Кроп').lastInsertRowid,
  )
  const revisionHomeworkId = Number(
    insertHomework.run(studentOneId, 3, 'text', null, 'Работа на доработке', 'revision', 'Классика').lastInsertRowid,
  )
  const secondStudentHomeworkId = Number(
    insertHomework.run(studentTwoId, 1, 'video', secondStudentFilePath, 'Работа второго ученика', 'approved', 'Бокс').lastInsertRowid,
  )
  const approvedDocumentHomeworkId = Number(
    insertHomework.run(studentOneId, 4, 'document', approvedFilePath, 'Документ', 'approved', 'Схема').lastInsertRowid,
  )
  const updateHomework = db.prepare(`
    UPDATE homeworks
    SET created_at = ?, updated_at = ?, revision_student_text = ?, revision_student_file_id = ?
    WHERE id = ?
  `)
  updateHomework.run('2026-09-20 12:00:00', '2026-09-20 12:00:00', null, null, approvedHomeworkId)
  updateHomework.run('2026-09-23 12:00:00', '2026-09-23 12:00:00', null, null, pendingHomeworkId)
  updateHomework.run(
    '2026-09-22 12:00:00',
    '2026-09-22 12:00:00',
    'Исправленное описание',
    revisionFilePath,
    revisionHomeworkId,
  )
  updateHomework.run('2026-09-19 12:00:00', '2026-09-19 12:00:00', null, null, approvedDocumentHomeworkId)

  db.prepare(`
    UPDATE users SET vk_user_id = ? WHERE id = ?
  `).run(7001, studentOneUserId)
  db.prepare(`
    UPDATE students SET student_track = 'intern', about_me = ?, avatar_file_id = ? WHERE id = ?
  `).run('О студенте', avatarFilePath, studentOneId)
  const insertReview = db.prepare(`
    INSERT INTO homework_reviews (homework_id, teacher_id, rating, comment, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const olderApprovedReviewId = Number(
    insertReview.run(
      approvedHomeworkId,
      teacherId,
      4,
      'Первая проверка',
      'approved',
      '2026-09-20 13:00:00',
    ).lastInsertRowid,
  )
  const latestApprovedReviewId = Number(
    insertReview.run(
      approvedHomeworkId,
      teacherId,
      5,
      'Отличная работа',
      'approved',
      '2026-09-21 13:00:00',
    ).lastInsertRowid,
  )
  const revisionReviewId = Number(
    insertReview.run(
      revisionHomeworkId,
      teacherId,
      null,
      'Исправьте окантовку',
      'rejected',
      '2026-09-22 13:00:00',
    ).lastInsertRowid,
  )
  const localAttachmentId = Number(db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order, created_at)
    VALUES (?, ?, 'photo', 0, '2026-09-20 12:10:00')
  `).run(approvedHomeworkId, revisionFilePath).lastInsertRowid)
  const telegramAttachmentId = Number(db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order, created_at)
    VALUES (?, 'telegram_attachment_file_12345', 'photo', 1, '2026-09-20 12:20:00')
  `).run(approvedHomeworkId).lastInsertRowid)
  const secondStudentAttachmentId = Number(db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order, created_at)
    VALUES (?, ?, 'document', 0, '2026-09-20 12:30:00')
  `).run(secondStudentHomeworkId, secondStudentFilePath).lastInsertRowid)
  const studentCommentId = Number(db.prepare(`
    INSERT INTO homework_comments (homework_id, author_user_id, text_content, created_at)
    VALUES (?, ?, 'Спасибо за обратную связь', '2026-09-21 14:00:00')
  `).run(approvedHomeworkId, studentOneUserId).lastInsertRowid)
  const teacherCommentId = Number(db.prepare(`
    INSERT INTO homework_comments (homework_id, author_user_id, text_content, created_at)
    VALUES (?, ?, 'Продолжайте в том же духе', '2026-09-21 15:00:00')
  `).run(approvedHomeworkId, teacherUserId).lastInsertRowid)
  const unreadNotificationId = Number(db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, payload, read_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    studentOneUserId,
    'contract_unread',
    'Непрочитанное',
    JSON.stringify({ homework_id: approvedHomeworkId, student_id: studentOneId }),
    null,
    '2026-09-22 12:00:00',
  ).lastInsertRowid)
  db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, payload, read_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    studentOneUserId,
    'contract_read',
    'Прочитанное',
    JSON.stringify({ homework_id: approvedDocumentHomeworkId }),
    '2026-09-22 13:00:00',
    '2026-09-21 12:00:00',
  )
  db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, payload, read_at, created_at)
    VALUES (?, 'contract_invalid', 'Невалидный payload', '{broken', '2026-09-20 13:00:00', '2026-09-20 12:00:00')
  `).run(studentOneUserId)
  const otherUserNotificationId = Number(db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, created_at)
    VALUES (?, 'other_user', 'Чужое уведомление', '2026-09-23 12:00:00')
  `).run(studentTwoUserId).lastInsertRowid)
  db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body, read_at, created_at)
    VALUES (?, 'expired', 'Устаревшее', '2020-01-01 13:00:00', '2020-01-01 12:00:00')
  `).run(studentOneUserId)
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    studentOneUserId,
    crypto.createHash('sha256').update(testWebSessionToken).digest('hex'),
  )
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    teacherUserId,
    crypto.createHash('sha256').update(testTeacherWebSessionToken).digest('hex'),
  )
  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    adminUserId,
    crypto.createHash('sha256').update(testAdminWebSessionToken).digest('hex'),
  )

  const approvedTeacherApplicationId = Number(db.prepare(`
    INSERT INTO teacher_applications
      (applicant_user_id, full_name, phone, status, created_at, updated_at)
    VALUES (?, 'Ирина Преподаватель', '+79995550001', 'approved',
      '2026-09-20 10:00:00', '2026-09-20 11:00:00')
  `).run(teacherUserId).lastInsertRowid)
  const pendingTeacherApplicationId = Number(db.prepare(`
    INSERT INTO teacher_applications
      (applicant_user_id, full_name, phone, status, created_at, updated_at)
    VALUES (?, 'Олег Кандидат', '+79995550002', 'pending',
      '2026-09-23 10:00:00', '2026-09-23 10:00:00')
  `).run(teacherApplicantUserId).lastInsertRowid)

  const insertFeedback = db.prepare(`
    INSERT INTO private_feedback (student_id, request_key, subject, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const feedbackIds = []
  for (let index = 1; index <= 51; index += 1) {
    feedbackIds.push(Number(insertFeedback.run(
      studentOneId,
      `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      index % 2 ? 'academy' : 'teacher',
      `Отзыв ${index}`,
      `2026-09-23 09:${String(index).padStart(2, '0')}:00`,
    ).lastInsertRowid))
  }
  db.prepare(`
    INSERT INTO audit_log (actor_user_id, action, meta, created_at)
    VALUES (?, 'admin_fixture_old', NULL, '2026-09-20 09:00:00'),
           (?, 'admin_fixture_new', '{"source":"contract"}', '2026-09-23 09:00:00')
  `).run(adminUserId, adminUserId)

  db.close()
  return {
    approvedHomeworkId,
    approvedDocumentHomeworkId,
    pendingHomeworkId,
    revisionHomeworkId,
    secondStudentHomeworkId,
    studentOneId,
    studentTwoId,
    unreadNotificationId,
    otherUserNotificationId,
    olderApprovedReviewId,
    latestApprovedReviewId,
    revisionReviewId,
    localAttachmentId,
    telegramAttachmentId,
    secondStudentAttachmentId,
    studentCommentId,
    teacherCommentId,
    approvedFilePath,
    avatarFilePath,
    pendingFilePath,
    revisionFilePath,
    approvedTeacherApplicationId,
    pendingTeacherApplicationId,
    feedbackIds,
  }
}

const buildTelegramInitData = (telegramUserId) => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `contract-${telegramUserId}`,
    user: JSON.stringify({ id: telegramUserId, first_name: 'Contract' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(testBotToken).digest()
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
  params.set('hash', hash)
  return params.toString()
}

const buildVkLaunchParams = (vkUserId) => {
  const params = new URLSearchParams({
    vk_app_id: '54558405',
    vk_user_id: String(vkUserId),
  })
  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&')
  params.set('sign', crypto.createHmac('sha256', testVkSecret).update(checkString).digest('base64url'))
  return params.toString()
}

const getResponse = async (path, telegramUserId = null) => {
  const headers = telegramUserId == null
    ? {}
    : { 'X-Telegram-Init-Data': buildTelegramInitData(telegramUserId) }
  return await fetch(`${baseUrl}${path}`, { headers })
}

const getJson = async (path, telegramUserId = null) => {
  const response = await getResponse(path, telegramUserId)
  const body = await response.json()
  return { response, body }
}

const postJson = async (path, body, telegramUserId = null) => {
  const headers = { 'Content-Type': 'application/json' }
  if (telegramUserId != null) {
    headers['X-Telegram-Init-Data'] = buildTelegramInitData(telegramUserId)
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return { response, body: await response.json() }
}

const createPendingHomework = ({ studentId, lessonNumber, isBonus = 0 }) => {
  const db = new Database(legacyDatabasePath)
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

const createModerationStudent = (telegramId = 0) => {
  const db = new Database(legacyDatabasePath)
  const userId = Number(db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, 'Новый', 'Ученик', 'student')
  `).run(telegramId).lastInsertRowid)
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, 'student')
  const studentId = Number(db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status)
    VALUES (?, 'Новый Ученик', '+79990000999', 10, 'moderation')
  `).run(userId).lastInsertRowid)
  db.close()
  return { userId, studentId }
}

const createAssignmentFixture = ({
  teacherTelegramId = 9201,
  studentTelegramId = 9202,
  studentTrack = 'student',
} = {}) => {
  const db = new Database(legacyDatabasePath)
  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, ?, ?, ?)
  `)
  const teacherUserId = Number(
    insertUser.run(teacherTelegramId, 'Новый', 'Наставник', 'teacher').lastInsertRowid,
  )
  const studentUserId = Number(
    insertUser.run(studentTelegramId, 'Новый', 'Подопечный', 'student').lastInsertRowid,
  )
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
    .run(teacherUserId, 'teacher')
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
    .run(studentUserId, 'student')
  const teacherId = Number(db.prepare(`
    INSERT INTO teachers (user_id, full_name) VALUES (?, 'Новый Наставник')
  `).run(teacherUserId).lastInsertRowid)
  const studentId = Number(db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, student_track)
    VALUES (?, 'Новый Подопечный', '+79990000920', 10, 'completed', ?)
  `).run(studentUserId, studentTrack).lastInsertRowid)
  db.close()
  return {
    teacherTelegramId,
    studentTelegramId,
    teacherUserId,
    studentUserId,
    teacherId,
    studentId,
  }
}

const createUpdateStudentFixture = ({ telegramId = 9301, status = 'studying' } = {}) => {
  const db = new Database(legacyDatabasePath)
  const userId = Number(db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, 'Редактируемый', 'Ученик', 'student')
  `).run(telegramId).lastInsertRowid)
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
    .run(userId, 'student')
  const studentId = Number(db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, student_track)
    VALUES (?, 'Редактируемый Ученик', '+79990000930', 5, ?, 'student')
  `).run(userId, status).lastInsertRowid)
  const teacherId = db.prepare(`
    SELECT t.id FROM teachers t
    JOIN users u ON u.id = t.user_id
    WHERE u.telegram_id = 2001
  `).get().id
  db.prepare(`
    INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)
  `).run(studentId, teacherId)
  db.close()
  return { userId, studentId, teacherId }
}

const createTeacherApplicationFixture = ({
  telegramId,
  status = 'pending',
  existingTeacher = false,
} = {}) => {
  const db = new Database(legacyDatabasePath)
  const userId = Number(db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, 'Кандидат', 'Преподаватель', 'guest')
  `).run(telegramId).lastInsertRowid)
  if (existingTeacher) {
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
      .run(userId, 'teacher')
    db.prepare(`
      INSERT INTO teachers (user_id, full_name) VALUES (?, 'Существующий Преподаватель')
    `).run(userId)
  }
  const applicationId = Number(db.prepare(`
    INSERT INTO teacher_applications
      (applicant_user_id, full_name, phone, status)
    VALUES (?, 'Кандидат Преподаватель', '+79990000940', ?)
  `).run(userId, status).lastInsertRowid)
  db.close()
  return { userId, applicationId }
}

const removeTeacherApplicationFixture = ({ userId, applicationId }) => {
  const db = new Database(legacyDatabasePath)
  db.prepare('DELETE FROM audit_log WHERE meta LIKE ?')
    .run(`%\"application_id\":${applicationId}%`)
  db.prepare('DELETE FROM app_notifications WHERE user_id = ?').run(userId)
  db.prepare('DELETE FROM teacher_applications WHERE id = ?').run(applicationId)
  db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  db.close()
}

let fixtureIds

before(async () => {
  temporaryRoot = await mkdtemp(join(os.tmpdir(), 'proof-craft-legacy-'))
  const isolatedProject = join(temporaryRoot, 'project')
  await cp(projectRoot, isolatedProject, {
    recursive: true,
    filter: (source) => !['.git', 'data', 'dist', 'node_modules'].includes(basename(source)),
  })
  await symlink(join(projectRoot, 'node_modules'), join(isolatedProject, 'node_modules'), 'dir')

  const port = await findFreePort()
  baseUrl = `http://127.0.0.1:${port}`
  apiProcess = spawn(process.execPath, ['bot/apiServer.js'], {
    cwd: isolatedProject,
    env: {
      ...process.env,
      API_HOST: '127.0.0.1',
      API_PORT: String(port),
      TG_WEBAPP_AUTH: 'strict',
      API_PREFIX_STRIP_REWRITE: '0',
      BOT_TOKEN: testBotToken,
      TELEGRAM_BOT_TOKEN: '',
      VITE_TELEGRAM_BOT_TOKEN: '',
      VK_APP_ID: '54558405',
      VK_APP_SECRET: testVkSecret,
      VK_ID_OFFSET: '10000000000',
      MAX_HOMEWORK_UPLOAD_MB: '0.001',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  apiProcess.stdout.on('data', (chunk) => { serverOutput += String(chunk) })
  apiProcess.stderr.on('data', (chunk) => { serverOutput += String(chunk) })

  await waitForHealth()
  legacyDatabasePath = join(isolatedProject, 'data', 'barber.db')
  fixtureIds = seedLegacyDatabase(legacyDatabasePath)
})

after(async () => {
  if (apiProcess && apiProcess.exitCode == null) {
    apiProcess.kill('SIGTERM')
    await new Promise((resolveExit) => {
      apiProcess.once('exit', resolveExit)
      setTimeout(resolveExit, 1_000).unref()
    })
  }
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('GET /health сообщает о готовности legacy API', async () => {
  const { response, body } = await getJson('/health')
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })
})

test('GET /api/session возвращает профиль и роли ученика', async () => {
  const { response, body } = await getJson('/api/session?telegram_id=3001', 3001)
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.role, 'student')
  assert.deepEqual(body.data.roles, ['student'])
  assert.equal(body.data.student.full_name, 'Анна Ученица')
  assert.equal(body.data.student.teachers.length, 1)
})

test('GET /api/session фиксирует полный агрегированный контракт ученика', async () => {
  const { response, body } = await getJson('/api/session?telegram_id=3001', 3001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: {
      hasUser: true,
      role: 'student',
      roles: ['student'],
      isAdmin: false,
      isTeacher: false,
      isStudent: true,
      isGuest: false,
      student: {
        id: fixtureIds.studentOneId,
        full_name: 'Анна Ученица',
        phone: '+79990000001',
        lessons_count: 10,
        status: 'studying',
        student_track: 'intern',
        metro: 'Центральная',
        about_me: 'О студенте',
        has_avatar: true,
        average_rating: 4.5,
        ratings_count: 2,
        teachers: [{ id: 1, full_name: 'Ирина Преподаватель' }],
      },
      teacher: null,
      unread_notifications_count: 1,
      vk_account_linked: true,
    },
  })
})

test('GET /api/session принимает web-session и подписанные VK launch params', async () => {
  const webResponse = await fetch(`${baseUrl}/api/session?telegram_id=3001`, {
    headers: { 'X-Web-Session': testWebSessionToken },
  })
  assert.equal(webResponse.status, 200)
  assert.equal((await webResponse.json()).data.student.full_name, 'Анна Ученица')

  const vkUserId = 7001
  const claimedTelegramId = 10_000_000_000 + vkUserId
  const vkResponse = await fetch(`${baseUrl}/api/session?telegram_id=${claimedTelegramId}`, {
    headers: {
      'X-Client-Platform': 'vk',
      'X-VK-User-Id': String(vkUserId),
      'X-App-User-Id': String(claimedTelegramId),
      'X-VK-Launch-Params': buildVkLaunchParams(vkUserId),
    },
  })
  assert.equal(vkResponse.status, 200)
  assert.equal((await vkResponse.json()).data.student.full_name, 'Анна Ученица')
})

test('strict Telegram auth отклоняет запрос без init data', async () => {
  const { response, body } = await getJson('/api/session?telegram_id=3001')
  assert.equal(response.status, 401)
  assert.equal(body.ok, false)
})

test('strict Telegram auth отклоняет несовпадающий telegram_id', async () => {
  const { response, body } = await getJson('/api/session?telegram_id=3001', 3002)
  assert.equal(response.status, 403)
  assert.equal(body.ok, false)
})

test('GET /api/student/homeworks фиксирует полный агрегированный контракт ученика', async () => {
  const { response, body } = await getJson('/api/student/homeworks?telegram_id=3001', 3001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: {
      homeworks: [
        {
          id: fixtureIds.pendingHomeworkId,
          student_id: fixtureIds.studentOneId,
          lesson_number: 2,
          is_bonus: false,
          haircut_name: 'Кроп',
          has_local_file: true,
          has_telegram_file: false,
          status: 'pending',
          content_type: 'photo',
          file_id: fixtureIds.pendingFilePath,
          text_content: 'Работа на проверке',
          review_count: 0,
          created_at: '2026-09-23 12:00:00',
          revision_student_text: null,
          revision_has_local_file: false,
          revision_has_telegram_file: false,
          reviews: [],
          latest_review: null,
          comments: [],
          extra_files_count: 0,
          attachments: [],
        },
        {
          id: fixtureIds.revisionHomeworkId,
          student_id: fixtureIds.studentOneId,
          lesson_number: 3,
          is_bonus: false,
          haircut_name: 'Классика',
          has_local_file: false,
          has_telegram_file: false,
          status: 'revision',
          content_type: 'text',
          file_id: null,
          text_content: 'Работа на доработке',
          review_count: 1,
          created_at: '2026-09-22 12:00:00',
          revision_student_text: 'Исправленное описание',
          revision_has_local_file: true,
          revision_has_telegram_file: false,
          reviews: [
            {
              id: fixtureIds.revisionReviewId,
              teacher_id: 1,
              teacher_name: 'Ирина Преподаватель',
              rating: null,
              comment: 'Исправьте окантовку',
              status: 'rejected',
              created_at: '2026-09-22 13:00:00',
            },
          ],
          latest_review: {
            id: fixtureIds.revisionReviewId,
            teacher_id: 1,
            teacher_name: 'Ирина Преподаватель',
            rating: null,
            comment: 'Исправьте окантовку',
            status: 'rejected',
            created_at: '2026-09-22 13:00:00',
          },
          comments: [],
          extra_files_count: 0,
          attachments: [],
        },
        {
          id: fixtureIds.approvedHomeworkId,
          student_id: fixtureIds.studentOneId,
          lesson_number: 1,
          is_bonus: false,
          haircut_name: 'Фейд',
          has_local_file: true,
          has_telegram_file: false,
          status: 'approved',
          content_type: 'photo',
          file_id: fixtureIds.approvedFilePath,
          text_content: 'Одобренная работа',
          review_count: 2,
          created_at: '2026-09-20 12:00:00',
          revision_student_text: null,
          revision_has_local_file: false,
          revision_has_telegram_file: false,
          reviews: [
            {
              id: fixtureIds.latestApprovedReviewId,
              teacher_id: 1,
              teacher_name: 'Ирина Преподаватель',
              rating: 5,
              comment: 'Отличная работа',
              status: 'approved',
              created_at: '2026-09-21 13:00:00',
            },
            {
              id: fixtureIds.olderApprovedReviewId,
              teacher_id: 1,
              teacher_name: 'Ирина Преподаватель',
              rating: 4,
              comment: 'Первая проверка',
              status: 'approved',
              created_at: '2026-09-20 13:00:00',
            },
          ],
          latest_review: {
            id: fixtureIds.latestApprovedReviewId,
            teacher_id: 1,
            teacher_name: 'Ирина Преподаватель',
            rating: 5,
            comment: 'Отличная работа',
            status: 'approved',
            created_at: '2026-09-21 13:00:00',
          },
          comments: [
            {
              id: fixtureIds.studentCommentId,
              author_user_id: 3,
              author_name: 'Анна Ученица',
              author_role: 'student',
              text_content: 'Спасибо за обратную связь',
              created_at: '2026-09-21 14:00:00',
            },
            {
              id: fixtureIds.teacherCommentId,
              author_user_id: 2,
              author_name: 'Ирина Преподаватель',
              author_role: 'teacher',
              text_content: 'Продолжайте в том же духе',
              created_at: '2026-09-21 15:00:00',
            },
          ],
          extra_files_count: 2,
          attachments: [
            {
              id: fixtureIds.localAttachmentId,
              content_type: 'photo',
              has_local_file: true,
              has_telegram_file: false,
            },
            {
              id: fixtureIds.telegramAttachmentId,
              content_type: 'photo',
              has_local_file: false,
              has_telegram_file: true,
            },
          ],
        },
        {
          id: fixtureIds.approvedDocumentHomeworkId,
          student_id: fixtureIds.studentOneId,
          lesson_number: 4,
          is_bonus: false,
          haircut_name: 'Схема',
          has_local_file: true,
          has_telegram_file: false,
          status: 'approved',
          content_type: 'document',
          file_id: fixtureIds.approvedFilePath,
          text_content: 'Документ',
          review_count: 0,
          created_at: '2026-09-19 12:00:00',
          revision_student_text: null,
          revision_has_local_file: false,
          revision_has_telegram_file: false,
          reviews: [],
          latest_review: null,
          comments: [],
          extra_files_count: 0,
          attachments: [],
        },
      ],
      average_rating: 4.5,
      ratings_count: 2,
    },
  })
})

test('student/homeworks изолирует ученика и принимает web-session', async () => {
  const otherStudent = await getJson('/api/student/homeworks?telegram_id=3002', 3002)
  assert.equal(otherStudent.response.status, 200)
  assert.deepEqual(
    otherStudent.body.data.homeworks.map((homework) => homework.id),
    [fixtureIds.secondStudentHomeworkId],
  )
  assert.equal(otherStudent.body.data.average_rating, null)
  assert.equal(otherStudent.body.data.ratings_count, 0)

  const webResponse = await fetch(`${baseUrl}/api/student/homeworks?telegram_id=3001`, {
    headers: { 'X-Web-Session': testWebSessionToken },
  })
  assert.equal(webResponse.status, 200)
  assert.equal((await webResponse.json()).data.homeworks.length, 4)
})

test('student/homeworks сохраняет auth и not-found ошибки', async (context) => {
  await context.test('нет credential', async () => {
    const { response } = await getJson('/api/student/homeworks?telegram_id=3001')
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await getJson('/api/student/homeworks?telegram_id=3001', 3002)
    assert.equal(response.status, 403)
  })

  await context.test('пользователь не ученик', async () => {
    const { response, body } = await getJson('/api/student/homeworks?telegram_id=2001', 2001)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Ученик не найден.' })
  })

  await context.test('подписанный неизвестный пользователь', async () => {
    const { response, body } = await getJson('/api/student/homeworks?telegram_id=9999', 9999)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Ученик не найден.' })
  })
})

test('GET /api/teacher/dashboard ограничивает преподавателя назначенными учениками', async () => {
  const { response, body } = await getJson('/api/teacher/dashboard?telegram_id=2001', 2001)

  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: {
      pendingCount: 1,
      latest: {
        id: fixtureIds.pendingHomeworkId,
        student_id: fixtureIds.studentOneId,
        student_name: 'Анна Ученица',
        lesson_number: 2,
        is_bonus: false,
        haircut_name: 'Кроп',
        created_at: '2026-09-23 12:00:00',
      },
      students: [
        {
          id: fixtureIds.studentOneId,
          full_name: 'Анна Ученица',
          pending_count: 1,
          has_avatar: true,
          telegram_id: 3001,
          username: null,
          first_name: 'Анна',
          last_name: 'Ученица',
        },
      ],
      lastStudents: [
        { student_id: fixtureIds.studentOneId, student_name: 'Анна Ученица' },
      ],
    },
  })
})

test('GET /api/teacher/dashboard разрешает администратору всех активных учеников', async () => {
  const response = await fetch(`${baseUrl}/api/teacher/dashboard?telegram_id=1001`, {
    headers: { 'X-Web-Session': testAdminWebSessionToken },
  })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.data.pendingCount, 1)
  assert.deepEqual(body.data.students.map((student) => student.id), [fixtureIds.studentOneId])
})

test('GET /api/teacher/students возвращает назначенных учеников и рейтинг', async () => {
  const { response, body } = await getJson('/api/teacher/students?telegram_id=2001', 2001)

  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: {
      students: [
        {
          id: fixtureIds.studentOneId,
          full_name: 'Анна Ученица',
          lessons_count: 10,
          status: 'studying',
          average_rating: 4.5,
          student_track: 'intern',
          ratings_count: 2,
          pending_homeworks_count: 1,
          has_avatar: true,
          teachers: [{ id: 1, full_name: 'Ирина Преподаватель' }],
        },
      ],
    },
  })

  const admin = await getJson('/api/teacher/students?telegram_id=1001', 1001)
  assert.equal(admin.response.status, 200)
  assert.deepEqual(
    admin.body.data.students.map((student) => student.id).sort((left, right) => left - right),
    [fixtureIds.studentOneId, fixtureIds.studentTwoId],
  )
})

test('GET /api/teacher/student-homeworks по умолчанию возвращает только pending', async () => {
  const { response, body } = await getJson(
    `/api/teacher/student-homeworks?telegram_id=2001&student_id=${fixtureIds.studentOneId}`,
    2001,
  )

  assert.equal(response.status, 200)
  assert.equal(body.data.student.full_name, 'Анна Ученица')
  assert.equal(body.data.student.average_rating, 4.5)
  assert.equal(body.data.student.ratings_count, 2)
  assert.deepEqual(
    body.data.homeworks.map((homework) => homework.id),
    [fixtureIds.pendingHomeworkId],
  )
})

test('teacher/student-homeworks поддерживает include_reviewed и web-session', async () => {
  const response = await fetch(
    `${baseUrl}/api/teacher/student-homeworks?telegram_id=2001&student_id=${fixtureIds.studentOneId}&include_reviewed=true`,
    { headers: { 'X-Web-Session': testTeacherWebSessionToken } },
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(
    body.data.homeworks.map((homework) => homework.id),
    [
      fixtureIds.pendingHomeworkId,
      fixtureIds.revisionHomeworkId,
      fixtureIds.approvedHomeworkId,
      fixtureIds.approvedDocumentHomeworkId,
    ],
  )
  assert.equal(body.data.homeworks[2].latest_review.rating, 5)
  assert.equal(body.data.homeworks[2].comments.length, 2)
  assert.equal(body.data.homeworks[2].attachments.length, 2)
})

test('teacher/student-homeworks проверяет назначение, а администратор видит всех', async () => {
  const denied = await getJson(
    `/api/teacher/student-homeworks?telegram_id=2001&student_id=${fixtureIds.studentTwoId}`,
    2001,
  )
  assert.equal(denied.response.status, 403)
  assert.deepEqual(denied.body, {
    ok: false,
    error: 'Ученик не прикреплён к этому преподавателю.',
  })

  const admin = await getJson(
    `/api/teacher/student-homeworks?telegram_id=1001&student_id=${fixtureIds.studentTwoId}&include_reviewed=true`,
    1001,
  )
  assert.equal(admin.response.status, 200)
  assert.deepEqual(
    admin.body.data.homeworks.map((homework) => homework.id),
    [fixtureIds.secondStudentHomeworkId],
  )
})

test('кабинет преподавателя сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('student_id проверяется до credential', async () => {
    const { response } = await getJson(
      '/api/teacher/student-homeworks?telegram_id=2001&student_id=invalid',
    )
    assert.equal(response.status, 400)
  })

  await context.test('нет credential', async () => {
    const { response } = await getJson('/api/teacher/dashboard?telegram_id=2001')
    assert.equal(response.status, 401)
  })

  await context.test('пользователь не найден', async () => {
    const { response, body } = await getJson('/api/teacher/dashboard?telegram_id=9999', 9999)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не преподаватель', async () => {
    const { response, body } = await getJson('/api/teacher/dashboard?telegram_id=3001', 3001)
    assert.equal(response.status, 403)
    assert.deepEqual(body, { ok: false, error: 'Доступ только для преподавателей.' })
  })
})

test('GET /api/notifications возвращает свои уведомления от новых к старым', async () => {
  const { response, body } = await getJson(
    '/api/notifications?telegram_id=3001&limit=3',
    3001,
  )
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.unread_count, 1)
  assert.deepEqual(
    body.data.notifications.map(({ id, ...notification }) => {
      assert.ok(Number.isInteger(id) && id > 0)
      return notification
    }),
    [
      {
        kind: 'contract_unread',
        body: 'Непрочитанное',
        payload: {
          homework_id: fixtureIds.approvedHomeworkId,
          student_id: fixtureIds.studentOneId,
        },
        read_at: null,
        created_at: '2026-09-22 12:00:00',
      },
      {
        kind: 'contract_read',
        body: 'Прочитанное',
        payload: { homework_id: fixtureIds.approvedDocumentHomeworkId },
        read_at: '2026-09-22 13:00:00',
        created_at: '2026-09-21 12:00:00',
      },
      {
        kind: 'contract_invalid',
        body: 'Невалидный payload',
        payload: null,
        read_at: '2026-09-20 13:00:00',
        created_at: '2026-09-20 12:00:00',
      },
    ],
  )
})

test('notifications limit не меняет общий unread_count', async () => {
  const { response, body } = await getJson(
    '/api/notifications?telegram_id=3001&limit=1',
    3001,
  )
  assert.equal(response.status, 200)
  assert.equal(body.data.notifications.length, 1)
  assert.equal(body.data.unread_count, 1)
})

test('notifications принимает web-session и не смешивает пользователей', async () => {
  const response = await fetch(`${baseUrl}/api/notifications?telegram_id=3001&limit=10`, {
    headers: { 'X-Web-Session': testWebSessionToken },
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.data.notifications.length, 3)
  assert.ok(body.data.notifications.every((notification) => notification.kind !== 'other_user'))
})

test('notifications сохраняет auth, query и unknown-user ошибки', async (context) => {
  await context.test('нет credential', async () => {
    const { response } = await getJson('/api/notifications?telegram_id=3001')
    assert.equal(response.status, 401)
  })

  await context.test('некорректный limit', async () => {
    const { response, body } = await getJson(
      '/api/notifications?telegram_id=3001&limit=81',
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('подписанный неизвестный пользователь', async () => {
    const { response, body } = await getJson(
      '/api/notifications?telegram_id=9999',
      9999,
    )
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Пользователь не найден.' })
  })
})

test('POST /api/notifications/read изменяет только свои уведомления', async () => {
  const foreign = await postJson('/api/notifications/read', {
    telegram_id: 3001,
    notification_id: fixtureIds.otherUserNotificationId,
  }, 3001)
  assert.equal(foreign.response.status, 200)
  assert.deepEqual(foreign.body, { ok: true })

  const bobBefore = await getJson('/api/notifications?telegram_id=3002', 3002)
  assert.equal(bobBefore.body.data.unread_count, 1)

  const own = await postJson('/api/notifications/read', {
    telegram_id: 3001,
    notification_id: fixtureIds.unreadNotificationId,
  }, 3001)
  assert.equal(own.response.status, 200)
  assert.deepEqual(own.body, { ok: true })

  const aliceAfter = await getJson('/api/notifications?telegram_id=3001', 3001)
  assert.equal(aliceAfter.body.data.unread_count, 0)
  assert.equal(
    typeof aliceAfter.body.data.notifications.find(
      (notification) => notification.id === fixtureIds.unreadNotificationId,
    )?.read_at,
    'string',
  )

  const all = await postJson('/api/notifications/read', {
    telegram_id: 3002,
    read_all: true,
  }, 3002)
  assert.equal(all.response.status, 200)
  assert.deepEqual(all.body, { ok: true })
  const bobAfter = await getJson('/api/notifications?telegram_id=3002', 3002)
  assert.equal(bobAfter.body.data.unread_count, 0)
})

test('POST /api/notifications/read сохраняет validation, auth и unknown-user ошибки', async (context) => {
  await context.test('нет цели изменения', async () => {
    const { response, body } = await postJson('/api/notifications/read', {
      telegram_id: 3001,
      read_all: false,
    }, 3001)
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Передайте notification_id или read_all: true.' })
  })

  await context.test('некорректный notification_id', async () => {
    const { response, body } = await postJson('/api/notifications/read', {
      telegram_id: 3001,
      notification_id: 0,
    }, 3001)
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await postJson('/api/notifications/read', {
      telegram_id: 3001,
      read_all: true,
    })
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await postJson('/api/notifications/read', {
      telegram_id: 3001,
      read_all: true,
    }, 3002)
    assert.equal(response.status, 403)
  })

  await context.test('подписанный неизвестный пользователь', async () => {
    const { response, body } = await postJson('/api/notifications/read', {
      telegram_id: 9999,
      read_all: true,
    }, 9999)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Пользователь не найден.' })
  })
})

test('GET /api/showcase/homeworks возвращает только approved фото и видео', async () => {
  const { response, body } = await getJson(
    '/api/showcase/homeworks?telegram_id=3001&limit=2',
    3001,
  )
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.cycled, false)
  assert.equal(body.data.homeworks.length, 2)

  const normalized = body.data.homeworks
    .map(({ created_at, ...homework }) => {
      assert.equal(typeof created_at, 'string')
      return homework
    })
    .sort((left, right) => left.id - right.id)
  assert.deepEqual(normalized, [
    {
      id: fixtureIds.approvedHomeworkId,
      student_name: 'Анна Ученица',
      haircut_name: 'Фейд',
      content_type: 'photo',
    },
    {
      id: fixtureIds.secondStudentHomeworkId,
      student_name: 'Мария Ученица',
      haircut_name: 'Бокс',
      content_type: 'video',
    },
  ])
})

test('showcase циклически дополняет выборку после exclude_ids', async () => {
  const { response, body } = await getJson(
    `/api/showcase/homeworks?telegram_id=3001&limit=2&exclude_ids=${fixtureIds.approvedHomeworkId}`,
    3001,
  )
  assert.equal(response.status, 200)
  assert.equal(body.data.cycled, true)
  assert.deepEqual(
    new Set(body.data.homeworks.map((homework) => homework.id)),
    new Set([fixtureIds.approvedHomeworkId, fixtureIds.secondStudentHomeworkId]),
  )
})

test('showcase требует подтверждённый credential', async () => {
  const { response, body } = await getJson('/api/showcase/homeworks?telegram_id=3001')
  assert.equal(response.status, 401)
  assert.equal(body.ok, false)
})

test('GET /api/showcase/homeworks/:id/file отдаёт approved media', async () => {
  const response = await getResponse(
    `/api/showcase/homeworks/${fixtureIds.approvedHomeworkId}/file?telegram_id=3001`,
    3001,
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/jpeg')
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')
  assert.equal(await response.text(), 'approved file')
})

test('showcase file различает неодобренную работу и неподдерживаемый тип', async () => {
  const pending = await getJson(
    `/api/showcase/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=3001`,
    3001,
  )
  assert.equal(pending.response.status, 404)
  assert.deepEqual(pending.body, { ok: false, error: 'Работа не найдена.' })

  const document = await getJson(
    `/api/showcase/homeworks/${fixtureIds.approvedDocumentHomeworkId}/file?telegram_id=3001`,
    3001,
  )
  assert.equal(document.response.status, 404)
  assert.deepEqual(document.body, {
    ok: false,
    error: 'Файл для предпросмотра недоступен.',
  })
})

test('GET /api/guest/portfolio-students фиксирует публичный whitelist и сортировку', async () => {
  const { response, body } = await getJson('/api/guest/portfolio-students')
  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: {
      students: [
        {
          id: fixtureIds.studentOneId,
          full_name: 'Анна Ученица',
          lessons_count: 10,
          student_track: 'intern',
          metro: 'Центральная',
          average_rating: 4.5,
          works_count: 4,
          has_avatar: true,
        },
        {
          id: fixtureIds.studentTwoId,
          full_name: 'Мария Ученица',
          lessons_count: 10,
          student_track: 'student',
          metro: 'Северная',
          average_rating: null,
          works_count: 1,
          has_avatar: false,
        },
      ],
    },
  })
})

test('legacy SEC-001: works_count публичного списка учитывает неодобренные работы', async () => {
  const { body } = await getJson('/api/guest/portfolio-students')
  const student = body.data.students.find((item) => item.id === fixtureIds.studentOneId)
  assert.equal(student.works_count, 4)
})

test('GET /api/guest/students/:id/avatar фиксирует публичные заголовки и содержимое', async () => {
  const response = await getResponse(`/api/guest/students/${fixtureIds.studentOneId}/avatar`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/jpeg')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=3600')
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')
  assert.equal(await response.text(), 'avatar file')
})

test('GET /api/guest/students/:id/avatar сохраняет ошибки недоступного аватара', async () => {
  const missing = await getJson(`/api/guest/students/${fixtureIds.studentTwoId}/avatar`)
  assert.equal(missing.response.status, 404)
  assert.deepEqual(missing.body, { ok: false, error: 'Аватар не установлен.' })

  const invalid = await getJson('/api/guest/students/nope/avatar')
  assert.equal(invalid.response.status, 400)
  assert.deepEqual(invalid.body, { ok: false, error: 'Некорректные параметры запроса.' })
})

test('GET /api/student/me/avatar отдаёт собственный аватар с private cache', async () => {
  const response = await getResponse('/api/student/me/avatar?telegram_id=3001', 3001)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'image/jpeg')
  assert.equal(response.headers.get('cache-control'), 'private, max-age=3600')
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')
  assert.equal(await response.text(), 'avatar file')
})

test('собственный аватар поддерживает web-session', async () => {
  const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
    headers: { 'X-Web-Session': testWebSessionToken },
  })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'avatar file')
})

test('собственный аватар сохраняет validation, auth и not-found ошибки', async (context) => {
  await context.test('нет telegram_id', async () => {
    const { response, body } = await getJson('/api/student/me/avatar')
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await getJson('/api/student/me/avatar?telegram_id=3001')
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await getJson('/api/student/me/avatar?telegram_id=3001', 3002)
    assert.equal(response.status, 403)
  })

  await context.test('пользователь не найден', async () => {
    const { response, body } = await getJson('/api/student/me/avatar?telegram_id=9999', 9999)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('у ученика нет аватара', async () => {
    const { response, body } = await getJson('/api/student/me/avatar?telegram_id=3002', 3002)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Аватар не установлен.' })
  })

  await context.test('у пользователя нет student-профиля', async () => {
    const { response, body } = await getJson('/api/student/me/avatar?telegram_id=2001', 2001)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Аватар не установлен.' })
  })
})

test('владелец, назначенный преподаватель и администратор читают аватар ученика', async () => {
  const path = `/api/students/${fixtureIds.studentOneId}/avatar?telegram_id=`
  for (const telegramId of [3001, 2001, 1001]) {
    const response = await getResponse(`${path}${telegramId}`, telegramId)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/jpeg')
    assert.equal(response.headers.get('cache-control'), 'private, max-age=3600')
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')
    assert.equal(await response.text(), 'avatar file')
  }
})

test('ролевой аватар поддерживает web-session владельца', async () => {
  const response = await fetch(
    `${baseUrl}/api/students/${fixtureIds.studentOneId}/avatar?telegram_id=3001`,
    { headers: { 'X-Web-Session': testWebSessionToken } },
  )
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'avatar file')
})

test('посторонний ученик и неназначенный преподаватель не читают аватар', async () => {
  const student = await getJson(
    `/api/students/${fixtureIds.studentOneId}/avatar?telegram_id=3002`,
    3002,
  )
  assert.equal(student.response.status, 403)
  assert.deepEqual(student.body, { ok: false, error: 'Нет доступа к профилю ученика.' })

  const teacher = await getJson(
    `/api/students/${fixtureIds.studentTwoId}/avatar?telegram_id=2001`,
    2001,
  )
  assert.equal(teacher.response.status, 403)
  assert.deepEqual(teacher.body, { ok: false, error: 'Нет доступа к профилю ученика.' })
})

test('ролевой аватар сохраняет validation, auth и порядок ошибок', async (context) => {
  await context.test('некорректный student_id', async () => {
    const { response, body } = await getJson('/api/students/nope/avatar?telegram_id=3001', 3001)
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет telegram_id', async () => {
    const { response, body } = await getJson(`/api/students/${fixtureIds.studentOneId}/avatar`)
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await getJson(
      `/api/students/${fixtureIds.studentOneId}/avatar?telegram_id=3001`,
    )
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await getJson(
      `/api/students/${fixtureIds.studentOneId}/avatar?telegram_id=3001`,
      3002,
    )
    assert.equal(response.status, 403)
  })

  await context.test('подписанный неизвестный пользователь не получает доступ', async () => {
    const { response, body } = await getJson(
      `/api/students/${fixtureIds.studentOneId}/avatar?telegram_id=9999`,
      9999,
    )
    assert.equal(response.status, 403)
    assert.deepEqual(body, { ok: false, error: 'Нет доступа к профилю ученика.' })
  })

  await context.test('у доступного ученика нет аватара', async () => {
    const { response, body } = await getJson(
      `/api/students/${fixtureIds.studentTwoId}/avatar?telegram_id=1001`,
      1001,
    )
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Аватар не установлен.' })
  })

  await context.test('администратор получает avatar-ошибку для отсутствующего профиля', async () => {
    const { response, body } = await getJson('/api/students/999999/avatar?telegram_id=1001', 1001)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Аватар не установлен.' })
  })
})

test('загрузка аватара сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('нет telegram_id', async () => {
    const response = await fetch(`${baseUrl}/api/student/me/avatar`, {
      method: 'POST',
      body: new FormData(),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
      method: 'POST',
      body: new FormData(),
    })
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
      method: 'POST',
      headers: { 'X-Telegram-Init-Data': buildTelegramInitData(3002) },
      body: new FormData(),
    })
    assert.equal(response.status, 403)
  })

  await context.test('пользователь не найден', async () => {
    const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=9999`, {
      method: 'POST',
      headers: { 'X-Telegram-Init-Data': buildTelegramInitData(9999) },
      body: new FormData(),
    })
    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не ученик', async () => {
    const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=2001`, {
      method: 'POST',
      headers: { 'X-Telegram-Init-Data': buildTelegramInitData(2001) },
      body: new FormData(),
    })
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { ok: false, error: 'Только ученики могут менять аватар.' })
  })
})

test('загрузка аватара различает отсутствие, размер и обработку файла', async (context) => {
  await context.test('файл не передан', async () => {
    const form = new FormData()
    form.set('description', 'без файла')
    const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
      method: 'POST',
      headers: { 'X-Telegram-Init-Data': buildTelegramInitData(3001) },
      body: form,
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { ok: false, error: 'Файл не получен.' })
  })

  await context.test('файл слишком большой', async () => {
    const form = new FormData()
    form.set('file', new Blob(['x'.repeat(2_048)], { type: 'image/png' }), 'large.png')
    const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
      method: 'POST',
      headers: { 'X-Telegram-Init-Data': buildTelegramInitData(3001) },
      body: form,
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { ok: false, error: 'Файл слишком большой.' })
  })

  await context.test('файл не является изображением', async () => {
    const form = new FormData()
    form.set('file', new Blob(['not an image'], { type: 'image/png' }), 'broken.png')
    const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
      method: 'POST',
      headers: { 'X-Telegram-Init-Data': buildTelegramInitData(3001) },
      body: form,
    })
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { ok: false, error: 'Ошибка обработки изображения.' })
  })
})

test('POST /api/student/me/avatar нормализует и заменяет аватар', async () => {
  const form = new FormData()
  form.set('file', new Blob([testImageSvg], { type: 'image/svg+xml' }), 'avatar.svg')
  const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
    method: 'POST',
    headers: { 'X-Telegram-Init-Data': buildTelegramInitData(3001) },
    body: form,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(existsSync(fixtureIds.avatarFilePath), false)

  const avatar = await getResponse('/api/student/me/avatar?telegram_id=3001', 3001)
  assert.equal(avatar.status, 200)
  assert.equal(avatar.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual([...new Uint8Array(await avatar.arrayBuffer()).slice(0, 2)], [0xff, 0xd8])
})

test('загрузка аватара поддерживает web-session', async () => {
  const form = new FormData()
  form.set('file', new Blob([testImageSvg], { type: 'image/svg+xml' }), 'avatar.svg')
  const response = await fetch(`${baseUrl}/api/student/me/avatar?telegram_id=3001`, {
    method: 'POST',
    headers: { 'X-Web-Session': testWebSessionToken },
    body: form,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
})

test('POST /api/student/about сохраняет trimmed-описание и очищает его пустой строкой', async () => {
  const updated = await postJson(
    '/api/student/about',
    { telegram_id: 3001, about_me: '  Новое описание ученика  ' },
    3001,
  )
  assert.equal(updated.response.status, 200)
  assert.deepEqual(updated.body, { ok: true })

  const updatedSession = await getJson('/api/session?telegram_id=3001', 3001)
  assert.equal(updatedSession.body.data.student.about_me, 'Новое описание ученика')

  const cleared = await postJson(
    '/api/student/about',
    { telegram_id: 3001, about_me: '   ' },
    3001,
  )
  assert.equal(cleared.response.status, 200)
  assert.deepEqual(cleared.body, { ok: true })

  const clearedSession = await getJson('/api/session?telegram_id=3001', 3001)
  assert.equal(clearedSession.body.data.student.about_me, '')

  await postJson('/api/student/about', { telegram_id: 3001, about_me: 'О студенте' }, 3001)
})

test('POST /api/student/about поддерживает web-session', async () => {
  const response = await fetch(`${baseUrl}/api/student/about`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Web-Session': testWebSessionToken,
    },
    body: JSON.stringify({ telegram_id: 3001, about_me: 'Через web-session' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })

  await postJson('/api/student/about', { telegram_id: 3001, about_me: 'О студенте' }, 3001)
})

test('POST /api/student/about сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('отсутствует about_me', async () => {
    const { response, body } = await postJson('/api/student/about', { telegram_id: 3001 }, 3001)
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('about_me длиннее 1000 символов', async () => {
    const { response, body } = await postJson(
      '/api/student/about',
      { telegram_id: 3001, about_me: 'x'.repeat(1001) },
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await postJson('/api/student/about', {
      telegram_id: 3001,
      about_me: 'Описание',
    })
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await postJson(
      '/api/student/about',
      { telegram_id: 3001, about_me: 'Описание' },
      3002,
    )
    assert.equal(response.status, 403)
  })

  for (const [name, telegramId] of [
    ['пользователь не найден', 9999],
    ['пользователь не ученик', 2001],
  ]) {
    await context.test(name, async () => {
      const { response, body } = await postJson(
        '/api/student/about',
        { telegram_id: telegramId, about_me: 'Описание' },
        telegramId,
      )
      assert.equal(response.status, 403)
      assert.deepEqual(body, {
        ok: false,
        error: 'Только ученик может изменить раздел «Обо мне».',
      })
    })
  }
})

test('POST /api/teacher/about сохраняет trimmed-описание и очищает его пустой строкой', async () => {
  const updated = await postJson(
    '/api/teacher/about',
    { telegram_id: 2001, about_me: '  Новое описание преподавателя  ' },
    2001,
  )
  assert.equal(updated.response.status, 200)
  assert.deepEqual(updated.body, { ok: true })

  const updatedSession = await getJson('/api/session?telegram_id=2001', 2001)
  assert.equal(updatedSession.body.data.teacher.about_me, 'Новое описание преподавателя')

  const cleared = await postJson(
    '/api/teacher/about',
    { telegram_id: 2001, about_me: '   ' },
    2001,
  )
  assert.equal(cleared.response.status, 200)
  assert.deepEqual(cleared.body, { ok: true })

  const clearedSession = await getJson('/api/session?telegram_id=2001', 2001)
  assert.equal(clearedSession.body.data.teacher.about_me, '')
})

test('POST /api/teacher/about поддерживает web-session', async () => {
  const response = await fetch(`${baseUrl}/api/teacher/about`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Web-Session': testTeacherWebSessionToken,
    },
    body: JSON.stringify({ telegram_id: 2001, about_me: 'Через web-session' }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })

  await postJson('/api/teacher/about', { telegram_id: 2001, about_me: '' }, 2001)
})

test('POST /api/teacher/about сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('отсутствует about_me', async () => {
    const { response, body } = await postJson('/api/teacher/about', { telegram_id: 2001 }, 2001)
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('about_me длиннее 1000 символов', async () => {
    const { response, body } = await postJson(
      '/api/teacher/about',
      { telegram_id: 2001, about_me: 'x'.repeat(1001) },
      2001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await postJson('/api/teacher/about', {
      telegram_id: 2001,
      about_me: 'Описание',
    })
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await postJson(
      '/api/teacher/about',
      { telegram_id: 2001, about_me: 'Описание' },
      3001,
    )
    assert.equal(response.status, 403)
  })

  for (const [name, telegramId] of [
    ['пользователь не найден', 9999],
    ['пользователь не преподаватель', 3001],
  ]) {
    await context.test(name, async () => {
      const { response, body } = await postJson(
        '/api/teacher/about',
        { telegram_id: telegramId, about_me: 'Описание' },
        telegramId,
      )
      assert.equal(response.status, 403)
      assert.deepEqual(body, {
        ok: false,
        error: 'Только преподаватель может изменить раздел «Обо мне».',
      })
    })
  }
})

test('GET /api/admin/teacher-applications возвращает только pending-заявки', async () => {
  const { response, body } = await getJson('/api/admin/teacher-applications?telegram_id=1001', 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: {
      applications: [{
        id: fixtureIds.pendingTeacherApplicationId,
        full_name: 'Олег Кандидат',
        phone: '+79995550002',
        telegram_id: 4001,
        created_at: '2026-09-23 10:00:00',
      }],
    },
  })
})

test('POST /api/admin/teacher-applications одобряет нового преподавателя', async () => {
  const target = createTeacherApplicationFixture({ telegramId: 9401 })
  const { response, body } = await postJson('/api/admin/teacher-applications', {
    telegram_id: 1001,
    application_id: String(target.applicationId),
    action: 'approve',
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true, data: { status: 'approved' } })

  const db = new Database(legacyDatabasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT status FROM teacher_applications WHERE id = ?
  `).get(target.applicationId), { status: 'approved' })
  assert.deepEqual(db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ? AND role = 'teacher'
  `).get(target.userId), { role: 'teacher' })
  assert.deepEqual(db.prepare(`
    SELECT full_name FROM teachers WHERE user_id = ?
  `).get(target.userId), { full_name: 'Кандидат Преподаватель' })
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'teacher_application_approved',
    meta: JSON.stringify({ application_id: target.applicationId, user_id: target.userId }),
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
  removeTeacherApplicationFixture(target)
})

test('POST /api/admin/teacher-applications отклоняет заявку без уведомления', async () => {
  const target = createTeacherApplicationFixture({ telegramId: 9402 })
  const dbBefore = new Database(legacyDatabasePath, { readonly: true })
  const notificationCountBefore = dbBefore.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications WHERE user_id = ?
  `).get(target.userId).count
  dbBefore.close()

  const { response, body } = await postJson('/api/admin/teacher-applications', {
    telegram_id: 1001,
    application_id: target.applicationId,
    action: 'reject',
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true, data: { status: 'rejected' } })

  const db = new Database(legacyDatabasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT status FROM teacher_applications WHERE id = ?
  `).get(target.applicationId), { status: 'rejected' })
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'teacher_application_rejected',
    meta: JSON.stringify({ application_id: target.applicationId }),
  })
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications WHERE user_id = ?
  `).get(target.userId).count, notificationCountBefore)
  db.close()
  removeTeacherApplicationFixture(target)
})

test('POST /api/admin/teacher-applications сохраняет ветку already_teacher', async () => {
  const target = createTeacherApplicationFixture({
    telegramId: 9403,
    existingTeacher: true,
  })
  const dbBefore = new Database(legacyDatabasePath, { readonly: true })
  const auditCountBefore = dbBefore.prepare(`
    SELECT COUNT(*) AS count FROM audit_log
  `).get().count
  dbBefore.close()

  const { response, body } = await postJson('/api/admin/teacher-applications', {
    telegram_id: 1001,
    application_id: target.applicationId,
    action: 'approve',
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: { status: 'approved', already_teacher: true },
  })

  const db = new Database(legacyDatabasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT status FROM teacher_applications WHERE id = ?
  `).get(target.applicationId), { status: 'approved' })
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM audit_log
  `).get().count, auditCountBefore)
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications WHERE user_id = ?
  `).get(target.userId).count, 0)
  db.close()
  removeTeacherApplicationFixture(target)
})

test('POST /api/admin/teacher-applications сохраняет validation, auth и domain-ошибки', async (context) => {
  const valid = {
    telegram_id: 1001,
    application_id: 999999,
    action: 'approve',
  }
  await context.test('body проверяется до credential', async () => {
    for (const payload of [
      { ...valid, application_id: 0 },
      { ...valid, application_id: 'nope' },
      { ...valid, action: 'archive' },
    ]) {
      const result = await postJson('/api/admin/teacher-applications', payload)
      assert.equal(result.response.status, 400)
      assert.deepEqual(result.body, {
        ok: false,
        error: 'Некорректные параметры запроса.',
      })
    }
  })
  await context.test('нет credential', async () => {
    assert.equal(
      (await postJson('/api/admin/teacher-applications', valid)).response.status,
      401,
    )
  })
  await context.test('credential не совпадает', async () => {
    assert.equal(
      (await postJson('/api/admin/teacher-applications', valid, 3001)).response.status,
      403,
    )
  })
  await context.test('пользователь не администратор', async () => {
    const result = await postJson('/api/admin/teacher-applications', {
      ...valid,
      telegram_id: 3001,
    }, 3001)
    assert.equal(result.response.status, 403)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Доступ только для администраторов.',
    })
  })
  await context.test('заявка отсутствует или обработана', async () => {
    const processed = createTeacherApplicationFixture({
      telegramId: 9404,
      status: 'rejected',
    })
    for (const applicationId of [999999, processed.applicationId]) {
      const result = await postJson('/api/admin/teacher-applications', {
        ...valid,
        application_id: applicationId,
      }, 1001)
      assert.equal(result.response.status, 404)
      assert.deepEqual(result.body, {
        ok: false,
        error: 'Заявка не найдена или уже обработана.',
      })
    }
    removeTeacherApplicationFixture(processed)
  })
})

test('GET /api/admin/feedback сохраняет cursor-пагинацию по 50 записей', async () => {
  const first = await getJson('/api/admin/feedback?telegram_id=1001', 1001)
  assert.equal(first.response.status, 200)
  assert.equal(first.body.data.items.length, 50)
  assert.deepEqual(first.body.data.items[0], {
    id: fixtureIds.feedbackIds[50],
    subject: 'academy',
    message: 'Отзыв 51',
    created_at: '2026-09-23 09:51:00',
    full_name: 'Анна Ученица',
  })
  assert.equal(first.body.data.next, fixtureIds.feedbackIds[1])

  const second = await getJson(
    `/api/admin/feedback?telegram_id=1001&before=${first.body.data.next}`,
    1001,
  )
  assert.deepEqual(second.body.data, {
    items: [{
      id: fixtureIds.feedbackIds[0],
      subject: 'academy',
      message: 'Отзыв 1',
      created_at: '2026-09-23 09:01:00',
      full_name: 'Анна Ученица',
    }],
    next: null,
  })
})

test('GET /api/admin/teachers возвращает преподавателей, телефон и активных учеников', async () => {
  const response = await fetch(`${baseUrl}/api/admin/teachers?telegram_id=1001`, {
    headers: { 'X-Web-Session': testAdminWebSessionToken },
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.data.teachers, [{
    id: body.data.teachers[0].id,
    user_id: body.data.teachers[0].user_id,
    full_name: 'Ирина Преподаватель',
    phone: '+79995550001',
    telegram_id: 2001,
    username: null,
    students_count: 1,
    students: [{
      id: fixtureIds.studentOneId,
      full_name: 'Анна Ученица',
      telegram_id: 3001,
      username: null,
    }],
  }])
})

test('GET /api/admin/students возвращает административный агрегат', async () => {
  const { response, body } = await getJson('/api/admin/students?telegram_id=1001', 1001)
  assert.equal(response.status, 200)
  assert.equal(body.data.students.length, 2)
  const anna = body.data.students.find((student) => student.id === fixtureIds.studentOneId)
  assert.deepEqual(anna, {
    id: fixtureIds.studentOneId,
    user_id: anna.user_id,
    full_name: 'Анна Ученица',
    phone: '+79990000001',
    telegram_id: 3001,
    username: null,
    first_name: 'Анна',
    last_name: 'Ученица',
    lessons_count: 10,
    status: 'studying',
    student_track: 'intern',
    teachers: [{ id: anna.teachers[0].id, full_name: 'Ирина Преподаватель' }],
    teacher_ids: [anna.teachers[0].id],
    average_rating: 4.5,
    ratings_count: 2,
    pending_homeworks_count: 1,
    has_avatar: true,
  })
})

test('GET /api/admin/student/:student_id возвращает профиль и полный агрегат работ', async () => {
  const { response, body } = await getJson(
    `/api/admin/student/${fixtureIds.studentOneId}?telegram_id=1001`,
    1001,
  )
  assert.equal(response.status, 200)
  assert.equal(body.data.student.id, fixtureIds.studentOneId)
  assert.equal(body.data.student.metro, 'Центральная')
  assert.equal(body.data.student.about_me, 'О студенте')
  assert.deepEqual(
    body.data.homeworks.map((homework) => homework.id),
    [
      fixtureIds.pendingHomeworkId,
      fixtureIds.revisionHomeworkId,
      fixtureIds.approvedHomeworkId,
      fixtureIds.approvedDocumentHomeworkId,
    ],
  )
  const approved = body.data.homeworks.find((homework) => homework.id === fixtureIds.approvedHomeworkId)
  assert.equal(approved.review_count, 2)
  assert.equal(approved.latest_review.id, fixtureIds.latestApprovedReviewId)
  assert.equal(approved.comments.length, 2)
  assert.deepEqual(approved.attachments.map(({ id }) => id), [
    fixtureIds.localAttachmentId,
    fixtureIds.telegramAttachmentId,
  ])
})

test('GET /api/admin/homeworks сохраняет общий и фильтрованный контракты', async () => {
  const all = await getJson('/api/admin/homeworks?telegram_id=1001', 1001)
  assert.equal(all.response.status, 200)
  assert.equal(all.body.data.homeworks.length, 5)
  const approved = all.body.data.homeworks.find(
    (homework) => homework.id === fixtureIds.approvedHomeworkId,
  )
  assert.equal(approved.student_name, 'Анна Ученица')
  assert.equal(approved.reviews.length, 2)
  assert.equal(approved.extra_files_count, 2)

  const filtered = await getJson(
    `/api/admin/homeworks?telegram_id=1001&student_id=${fixtureIds.studentOneId}`,
    1001,
  )
  assert.deepEqual(
    filtered.body.data.homeworks.map((homework) => homework.id),
    [
      fixtureIds.pendingHomeworkId,
      fixtureIds.revisionHomeworkId,
      fixtureIds.approvedHomeworkId,
      fixtureIds.approvedDocumentHomeworkId,
    ],
  )
  assert.equal(Object.hasOwn(filtered.body.data.homeworks[0], 'student_name'), false)

  const emptyFilter = await getJson(
    '/api/admin/homeworks?telegram_id=1001&student_id=',
    1001,
  )
  assert.equal(emptyFilter.body.data.homeworks.length, 5)
})

test('GET /api/admin/audit возвращает raw meta и соблюдает limit', async () => {
  const { response, body } = await getJson('/api/admin/audit?telegram_id=1001&limit=1', 1001)
  assert.equal(response.status, 200)
  assert.equal(body.data.entries.length, 1)
  assert.deepEqual(body.data.entries[0], {
    id: body.data.entries[0].id,
    action: 'admin_fixture_new',
    meta: '{"source":"contract"}',
    created_at: '2026-09-23 09:00:00',
    actor_user_id: body.data.entries[0].actor_user_id,
    actor_telegram_id: 1001,
  })
})

test('административные GET сохраняют validation, auth, role и not-found ошибки', async (context) => {
  for (const path of [
    '/api/admin/feedback?telegram_id=1001&before=0',
    '/api/admin/students?telegram_id=1001&status=unknown',
    '/api/admin/student/nope?telegram_id=1001',
    '/api/admin/homeworks?telegram_id=1001&student_id=0',
    '/api/admin/audit?telegram_id=1001&limit=201',
  ]) {
    await context.test(`validation: ${path}`, async () => {
      const { response, body } = await getJson(path)
      assert.equal(response.status, 400)
      assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
    })
  }

  await context.test('нет credential', async () => {
    const { response } = await getJson('/api/admin/teachers?telegram_id=1001')
    assert.equal(response.status, 401)
  })
  await context.test('не администратор', async () => {
    const { response, body } = await getJson('/api/admin/teachers?telegram_id=3001', 3001)
    assert.equal(response.status, 403)
    assert.deepEqual(body, { ok: false, error: 'Доступ только для администраторов.' })
  })
  await context.test('ученик не найден', async () => {
    const { response, body } = await getJson('/api/admin/student/999999?telegram_id=1001', 1001)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Ученик не найден.' })
  })
})

test('POST /api/admin/students выполняет модерацию, назначения и уведомления', async () => {
  const target = createModerationStudent()
  const actions = [
    {
      body: {
        telegram_id: 1001,
        student_id: target.studentId,
        action: 'approve',
        teacher_ids: [1, 1],
      },
      status: 'studying',
      audit: 'admin_student_approve',
      message: '🎉 Ваша заявка одобрена! Теперь вы можете сдавать домашние задания.',
    },
    {
      body: {
        telegram_id: 1001,
        student_id: target.studentId,
        action: 'set_completed',
        teacher_ids: [999999],
      },
      status: 'completed',
      audit: 'admin_student_set_completed',
      message: 'Ваш статус обучения обновлен: завершил обучение.',
    },
    {
      body: { telegram_id: 1001, student_id: target.studentId, action: 'set_studying' },
      status: 'studying',
      audit: 'admin_student_set_studying',
      message: 'Ваш статус обучения обновлен: обучается.',
    },
    {
      body: { telegram_id: 1001, student_id: target.studentId, action: 'reject' },
      status: 'rejected',
      audit: 'admin_student_reject',
      message: 'К сожалению, ваша заявка была отклонена.',
    },
  ]

  for (const expected of actions) {
    const { response, body } = await postJson('/api/admin/students', expected.body, 1001)
    assert.equal(response.status, 200)
    assert.deepEqual(body, { ok: true })

    const db = new Database(legacyDatabasePath, { readonly: true })
    const student = db.prepare('SELECT status FROM students WHERE id = ?').get(target.studentId)
    const audit = db.prepare(`
      SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
    `).get()
    const notification = db.prepare(`
      SELECT kind, body, payload FROM app_notifications
      WHERE user_id = ? ORDER BY id DESC LIMIT 1
    `).get(target.userId)
    db.close()

    assert.equal(student.status, expected.status)
    assert.deepEqual(audit, {
      action: expected.audit,
      meta: JSON.stringify({ student_id: target.studentId, status: expected.status }),
    })
    assert.deepEqual(notification, {
      kind: 'student_status',
      body: expected.message,
      payload: JSON.stringify({
        action: expected.body.action,
        student_id: target.studentId,
      }),
    })
  }

  const db = new Database(legacyDatabasePath, { readonly: true })
  const assignments = db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ? ORDER BY teacher_id
  `).all(target.studentId)
  db.close()
  assert.deepEqual(assignments, [{ teacher_id: 1 }])
})

test('POST /api/admin/students сохраняет validation, auth и domain-ошибки', async (context) => {
  const validBody = { telegram_id: 1001, student_id: 999999, action: 'approve' }

  await context.test('body проверяется до credential', async () => {
    for (const body of [
      { ...validBody, student_id: 0 },
      { ...validBody, action: 'archive' },
      { ...validBody, teacher_ids: null },
      { ...validBody, teacher_ids: [0] },
      { ...validBody, teacher_ids: Array.from({ length: 81 }, (_, index) => index + 1) },
    ]) {
      const result = await postJson('/api/admin/students', body)
      assert.equal(result.response.status, 400)
      assert.deepEqual(result.body, { ok: false, error: 'Некорректные параметры запроса.' })
    }
  })

  await context.test('нет credential', async () => {
    const result = await postJson('/api/admin/students', validBody)
    assert.equal(result.response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const result = await postJson('/api/admin/students', validBody, 3001)
    assert.equal(result.response.status, 403)
  })

  await context.test('пользователь не найден', async () => {
    const result = await postJson(
      '/api/admin/students',
      { telegram_id: 9999, student_id: 999999, action: 'approve' },
      9999,
    )
    assert.equal(result.response.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не администратор', async () => {
    const result = await postJson(
      '/api/admin/students',
      { telegram_id: 3001, student_id: 999999, action: 'approve' },
      3001,
    )
    assert.equal(result.response.status, 403)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Доступ только для администраторов.',
    })
  })

  await context.test('ученик не найден', async () => {
    const result = await postJson('/api/admin/students', validBody, 1001)
    assert.equal(result.response.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Ученик не найден.' })
  })

  await context.test('преподаватель для approve не найден', async () => {
    const target = createModerationStudent(9900)
    const result = await postJson(
      '/api/admin/students',
      {
        telegram_id: 1001,
        student_id: target.studentId,
        action: 'approve',
        teacher_ids: [999999],
      },
      1001,
    )
    assert.equal(result.response.status, 400)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Преподаватель с id 999999 не найден.',
    })

    const db = new Database(legacyDatabasePath, { readonly: true })
    const student = db.prepare('SELECT status FROM students WHERE id = ?').get(target.studentId)
    const assignments = db.prepare(`
      SELECT teacher_id FROM student_teachers WHERE student_id = ?
    `).all(target.studentId)
    db.close()
    assert.equal(student.status, 'moderation')
    assert.deepEqual(assignments, [])
  })
})

test('POST /api/admin/teachers назначает роль, создаёт профиль и уведомляет', async () => {
  const targetTelegramId = 9101
  const db = new Database(legacyDatabasePath)
  const targetUserId = Number(db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, role)
    VALUES (?, 'Новый', 'Преподаватель', 'guest')
  `).run(targetTelegramId).lastInsertRowid)
  db.close()

  const { response, body } = await postJson('/api/admin/teachers', {
    telegram_id: 1001,
    target_telegram_id: String(targetTelegramId),
    action: 'assign',
    full_name: '  Контрактный Преподаватель  ',
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const verification = new Database(legacyDatabasePath, { readonly: true })
  const role = verification.prepare(`
    SELECT role FROM user_roles WHERE user_id = ? AND role = 'teacher'
  `).get(targetUserId)
  const teacher = verification.prepare(`
    SELECT id, full_name FROM teachers WHERE user_id = ?
  `).get(targetUserId)
  const audit = verification.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notification = verification.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(targetUserId)
  verification.close()

  assert.deepEqual(role, { role: 'teacher' })
  assert.equal(teacher.full_name, 'Контрактный Преподаватель')
  assert.deepEqual(audit, {
    action: 'admin_teacher_assign',
    meta: JSON.stringify({ target_telegram_id: targetTelegramId }),
  })
  assert.deepEqual(notification, {
    kind: 'teacher_role_assigned',
    body: 'Вам назначена роль преподавателя. Откройте мини-приложение для проверки работ.',
    payload: '{}',
  })
})

test('legacy SEC-003: снятие роли удаляет профиль и исторические проверки', async () => {
  const targetTelegramId = 9101
  const db = new Database(legacyDatabasePath)
  const target = db.prepare(`
    SELECT u.id AS user_id, t.id AS teacher_id
    FROM users u JOIN teachers t ON t.user_id = u.id
    WHERE u.telegram_id = ?
  `).get(targetTelegramId)
  db.prepare(`
    INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)
  `).run(fixtureIds.studentOneId, target.teacher_id)
  const reviewId = Number(db.prepare(`
    INSERT INTO homework_reviews
      (homework_id, teacher_id, rating, comment, status)
    VALUES (?, ?, 5, 'Историческая проверка', 'approved')
  `).run(fixtureIds.approvedHomeworkId, target.teacher_id).lastInsertRowid)
  db.close()

  const { response, body } = await postJson('/api/admin/teachers', {
    telegram_id: 1001,
    target_telegram_id: targetTelegramId,
    action: 'remove',
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const verification = new Database(legacyDatabasePath, { readonly: true })
  const role = verification.prepare(`
    SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'teacher'
  `).get(target.user_id)
  const teacher = verification.prepare('SELECT 1 FROM teachers WHERE id = ?')
    .get(target.teacher_id)
  const assignment = verification.prepare(`
    SELECT 1 FROM student_teachers WHERE teacher_id = ?
  `).get(target.teacher_id)
  const review = verification.prepare('SELECT 1 FROM homework_reviews WHERE id = ?')
    .get(reviewId)
  verification.close()

  assert.equal(role, undefined)
  assert.equal(teacher, undefined)
  assert.equal(assignment, undefined)
  assert.equal(review, undefined)
})

test('POST /api/admin/teachers сохраняет validation, auth и domain-ошибки', async (context) => {
  const validBody = {
    telegram_id: 1001,
    target_telegram_id: 9999,
    action: 'assign',
  }

  await context.test('body проверяется до credential', async () => {
    for (const body of [
      { ...validBody, target_telegram_id: 0 },
      { ...validBody, action: 'archive' },
      { ...validBody, full_name: null },
    ]) {
      const result = await postJson('/api/admin/teachers', body)
      assert.equal(result.response.status, 400)
      assert.deepEqual(result.body, { ok: false, error: 'Некорректные параметры запроса.' })
    }
  })
  await context.test('нет credential', async () => {
    assert.equal((await postJson('/api/admin/teachers', validBody)).response.status, 401)
  })
  await context.test('credential не совпадает', async () => {
    assert.equal((await postJson('/api/admin/teachers', validBody, 3001)).response.status, 403)
  })
  await context.test('пользователь не администратор', async () => {
    const result = await postJson('/api/admin/teachers', {
      telegram_id: 3001,
      target_telegram_id: 9999,
      action: 'assign',
    }, 3001)
    assert.equal(result.response.status, 403)
  })
  await context.test('целевой пользователь не найден', async () => {
    const result = await postJson('/api/admin/teachers', validBody, 1001)
    assert.equal(result.response.status, 404)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Пользователь не найден. Попросите его отправить /start боту.',
    })
  })
})

test('POST admin/assign-student и unassign-student меняют связь и создают побочные эффекты', async () => {
  const target = createAssignmentFixture()
  const assignmentBody = {
    telegram_id: 1001,
    teacher_id: target.teacherId,
    student_id: target.studentId,
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { response, body } = await postJson(
      '/api/admin/assign-student',
      assignmentBody,
      1001,
    )
    assert.equal(response.status, 200)
    assert.deepEqual(body, { ok: true })
  }

  let db = new Database(legacyDatabasePath, { readonly: true })
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM student_teachers
    WHERE student_id = ? AND teacher_id = ?
  `).get(target.studentId, target.teacherId).count, 1)
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_assign_student',
    meta: JSON.stringify({ teacher_id: target.teacherId, student_id: target.studentId }),
  })
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(target.teacherUserId), {
    kind: 'student_assigned',
    body: 'К вам прикреплён ученик: Новый Подопечный.',
    payload: JSON.stringify({ student_id: target.studentId, teacher_id: target.teacherId }),
  })
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(target.studentUserId), {
    kind: 'teacher_assigned',
    body: 'Вас прикрепили к преподавателю: Новый Наставник.',
    payload: JSON.stringify({ student_id: target.studentId, teacher_id: target.teacherId }),
  })
  db.close()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { response, body } = await postJson(
      '/api/admin/unassign-student',
      assignmentBody,
      1001,
    )
    assert.equal(response.status, 200)
    assert.deepEqual(body, { ok: true })
  }

  db = new Database(legacyDatabasePath, { readonly: true })
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM student_teachers
    WHERE student_id = ? AND teacher_id = ?
  `).get(target.studentId, target.teacherId).count, 0)
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_unassign_student',
    meta: JSON.stringify({ teacher_id: target.teacherId, student_id: target.studentId }),
  })
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(target.teacherUserId), {
    kind: 'student_unassigned',
    body: 'Ученик Новый Подопечный снят с вашего ведения.',
    payload: JSON.stringify({ student_id: target.studentId, teacher_id: target.teacherId }),
  })
  assert.deepEqual(db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = ? ORDER BY id DESC LIMIT 1
  `).get(target.studentUserId), {
    kind: 'teacher_unassigned',
    body: 'Преподаватель Новый Наставник снят с вашего обучения.',
    payload: JSON.stringify({ student_id: target.studentId, teacher_id: target.teacherId }),
  })
  db.close()

  const cleanup = new Database(legacyDatabasePath)
  cleanup.prepare('DELETE FROM users WHERE id IN (?, ?)')
    .run(target.teacherUserId, target.studentUserId)
  cleanup.close()
})

test('POST admin/assign-student сохраняет запрет связи для уровня barber', async () => {
  const target = createAssignmentFixture({
    teacherTelegramId: 9211,
    studentTelegramId: 9212,
    studentTrack: 'barber',
  })
  const { response, body } = await postJson('/api/admin/assign-student', {
    telegram_id: 1001,
    teacher_id: target.teacherId,
    student_id: target.studentId,
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM student_teachers
    WHERE student_id = ? AND teacher_id = ?
  `).get(target.studentId, target.teacherId).count, 0)
  assert.equal(db.prepare(`
    SELECT COUNT(*) AS count FROM app_notifications
    WHERE user_id IN (?, ?) AND kind IN ('student_assigned', 'teacher_assigned')
  `).get(target.teacherUserId, target.studentUserId).count, 2)
  db.close()

  const cleanup = new Database(legacyDatabasePath)
  cleanup.prepare('DELETE FROM users WHERE id IN (?, ?)')
    .run(target.teacherUserId, target.studentUserId)
  cleanup.close()
})

test('POST admin assignment сохраняет validation, auth и not-found ошибки', async (context) => {
  const validBody = { telegram_id: 1001, teacher_id: 999999, student_id: 999999 }
  for (const path of ['/api/admin/assign-student', '/api/admin/unassign-student']) {
    await context.test(`${path}: body до credential`, async () => {
      for (const body of [
        { ...validBody, teacher_id: 0 },
        { ...validBody, student_id: 'nope' },
      ]) {
        const result = await postJson(path, body)
        assert.equal(result.response.status, 400)
        assert.deepEqual(result.body, { ok: false, error: 'Некорректные параметры запроса.' })
      }
    })
    await context.test(`${path}: нет credential`, async () => {
      assert.equal((await postJson(path, validBody)).response.status, 401)
    })
    await context.test(`${path}: пользователь не администратор`, async () => {
      const result = await postJson(path, {
        telegram_id: 3001,
        teacher_id: 999999,
        student_id: 999999,
      }, 3001)
      assert.equal(result.response.status, 403)
    })
  }

  const missingTeacher = await postJson('/api/admin/assign-student', validBody, 1001)
  assert.equal(missingTeacher.response.status, 404)
  assert.deepEqual(missingTeacher.body, { ok: false, error: 'Преподаватель не найден.' })

  const missingPair = await postJson('/api/admin/unassign-student', validBody, 1001)
  assert.equal(missingPair.response.status, 404)
  assert.deepEqual(missingPair.body, { ok: false, error: 'Преподаватель или ученик не найден.' })
})

test('POST /api/admin/update-student обновляет поля и полностью заменяет назначения', async () => {
  const target = createUpdateStudentFixture()
  const { response, body } = await postJson('/api/admin/update-student', {
    telegram_id: 1001,
    student_id: String(target.studentId),
    lessons_count: '12',
    student_track: 'intern',
    teacher_ids: [String(target.teacherId), target.teacherId],
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  let db = new Database(legacyDatabasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT lessons_count, student_track FROM students WHERE id = ?
  `).get(target.studentId), { lessons_count: 12, student_track: 'intern' })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ? ORDER BY teacher_id
  `).all(target.studentId), [{ teacher_id: target.teacherId }])
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_update_student',
    meta: JSON.stringify({
      student_id: target.studentId,
      lessons_count: 12,
      student_track: 'intern',
      teacher_ids: [target.teacherId, target.teacherId],
    }),
  })
  db.close()

  const clear = await postJson('/api/admin/update-student', {
    telegram_id: 1001,
    student_id: target.studentId,
    teacher_ids: [],
  }, 1001)
  assert.equal(clear.response.status, 200)
  assert.deepEqual(clear.body, { ok: true })

  db = new Database(legacyDatabasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(target.studentId), [])
  assert.deepEqual(db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get(), {
    action: 'admin_update_student',
    meta: JSON.stringify({
      student_id: target.studentId,
      lessons_count: null,
      student_track: null,
      teacher_ids: [],
    }),
  })
  db.close()

  const cleanup = new Database(legacyDatabasePath)
  cleanup.prepare('DELETE FROM users WHERE id = ?').run(target.userId)
  cleanup.close()
})

test('POST /api/admin/update-student снимает назначения при уровне barber', async () => {
  const target = createUpdateStudentFixture({ telegramId: 9302 })
  const { response, body } = await postJson('/api/admin/update-student', {
    telegram_id: 1001,
    student_id: target.studentId,
    student_track: 'barber',
    teacher_ids: [target.teacherId],
  }, 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  assert.equal(db.prepare(`
    SELECT student_track FROM students WHERE id = ?
  `).get(target.studentId).student_track, 'barber')
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(target.studentId), [])
  db.close()

  const cleanup = new Database(legacyDatabasePath)
  cleanup.prepare('DELETE FROM users WHERE id = ?').run(target.userId)
  cleanup.close()
})

test('legacy BUG-003: update-student оставляет частичное обновление перед domain-ошибкой', async () => {
  const invalidTeacherTarget = createUpdateStudentFixture({ telegramId: 9303 })
  const invalidTeacher = await postJson('/api/admin/update-student', {
    telegram_id: 1001,
    student_id: invalidTeacherTarget.studentId,
    lessons_count: 8,
    student_track: 'intern',
    teacher_ids: [999999],
  }, 1001)
  assert.equal(invalidTeacher.response.status, 400)
  assert.deepEqual(invalidTeacher.body, {
    ok: false,
    error: 'Преподаватель с id 999999 не найден.',
  })

  const moderationTarget = createUpdateStudentFixture({
    telegramId: 9304,
    status: 'moderation',
  })
  const invalidStatus = await postJson('/api/admin/update-student', {
    telegram_id: 1001,
    student_id: moderationTarget.studentId,
    lessons_count: 9,
    student_track: 'barber',
    teacher_ids: [moderationTarget.teacherId],
  }, 1001)
  assert.equal(invalidStatus.response.status, 400)
  assert.deepEqual(invalidStatus.body, {
    ok: false,
    error: 'Назначать преподавателей можно только при статусе «обучается» или «завершил».',
  })

  const db = new Database(legacyDatabasePath, { readonly: true })
  assert.deepEqual(db.prepare(`
    SELECT lessons_count, student_track FROM students WHERE id = ?
  `).get(invalidTeacherTarget.studentId), {
    lessons_count: 8,
    student_track: 'intern',
  })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(invalidTeacherTarget.studentId), [{ teacher_id: invalidTeacherTarget.teacherId }])
  assert.deepEqual(db.prepare(`
    SELECT lessons_count, student_track FROM students WHERE id = ?
  `).get(moderationTarget.studentId), {
    lessons_count: 9,
    student_track: 'barber',
  })
  assert.deepEqual(db.prepare(`
    SELECT teacher_id FROM student_teachers WHERE student_id = ?
  `).all(moderationTarget.studentId), [])
  const audits = db.prepare(`
    SELECT COUNT(*) AS count FROM audit_log
    WHERE action = 'admin_update_student'
      AND json_extract(meta, '$.student_id') IN (?, ?)
  `).get(invalidTeacherTarget.studentId, moderationTarget.studentId)
  assert.equal(audits.count, 0)
  db.close()

  const cleanup = new Database(legacyDatabasePath)
  cleanup.prepare('DELETE FROM users WHERE id IN (?, ?)')
    .run(invalidTeacherTarget.userId, moderationTarget.userId)
  cleanup.close()
})

test('POST /api/admin/update-student сохраняет validation, auth и not-found ошибки', async (context) => {
  const validBody = { telegram_id: 1001, student_id: 999999 }
  await context.test('body проверяется до credential', async () => {
    for (const body of [
      { ...validBody, student_id: 0 },
      { ...validBody, lessons_count: -1 },
      { ...validBody, lessons_count: 1.5 },
      { ...validBody, student_track: 'master' },
      { ...validBody, teacher_ids: null },
      { ...validBody, teacher_ids: [0] },
    ]) {
      const result = await postJson('/api/admin/update-student', body)
      assert.equal(result.response.status, 400)
      assert.deepEqual(result.body, { ok: false, error: 'Некорректные параметры запроса.' })
    }
  })
  await context.test('нет credential', async () => {
    assert.equal((await postJson('/api/admin/update-student', validBody)).response.status, 401)
  })
  await context.test('credential не совпадает', async () => {
    assert.equal((await postJson('/api/admin/update-student', validBody, 3001)).response.status, 403)
  })
  await context.test('пользователь не администратор', async () => {
    const result = await postJson('/api/admin/update-student', {
      telegram_id: 3001,
      student_id: 999999,
    }, 3001)
    assert.equal(result.response.status, 403)
  })
  await context.test('ученик не найден', async () => {
    const result = await postJson('/api/admin/update-student', validBody, 1001)
    assert.equal(result.response.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Ученик не найден.' })
  })
})

test('POST /api/student/profile-edit создаёт pending-заявку, аудит и уведомление администратору', async () => {
  const { response, body } = await postJson(
    '/api/student/profile-edit',
    {
      telegram_id: 3001,
      full_name: '  Анна Новая  ',
      phone: ' 12345 ',
      metro: '',
    },
    3001,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  const edit = db.prepare(`
    SELECT student_id, new_full_name, new_phone, new_metro, status
    FROM student_profile_edits
    ORDER BY id DESC LIMIT 1
  `).get()
  const student = db.prepare(`
    SELECT full_name, phone, metro FROM students WHERE id = ?
  `).get(fixtureIds.studentOneId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notification = db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE kind = 'profile_edit_pending'
    ORDER BY id DESC LIMIT 1
  `).get()
  db.close()

  assert.deepEqual(edit, {
    student_id: fixtureIds.studentOneId,
    new_full_name: '  Анна Новая  ',
    new_phone: ' 12345 ',
    new_metro: null,
    status: 'pending',
  })
  assert.deepEqual(student, {
    full_name: 'Анна Ученица',
    phone: '+79990000001',
    metro: 'Центральная',
  })
  assert.deepEqual(audit, {
    action: 'student_profile_edit_submitted',
    meta: JSON.stringify({ student_id: fixtureIds.studentOneId }),
  })
  assert.deepEqual(notification, {
    kind: 'profile_edit_pending',
    body: 'Ученик Анна Ученица отправил заявку на изменение профиля.',
    payload: JSON.stringify({ student_id: fixtureIds.studentOneId }),
  })
})

test('повторная profile-edit заявка отклоняет предыдущую и поддерживает web-session', async () => {
  const response = await fetch(`${baseUrl}/api/student/profile-edit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Web-Session': testWebSessionToken,
    },
    body: JSON.stringify({
      telegram_id: 3001,
      full_name: 'Анна Последняя',
      phone: '+79991112233',
      metro: 'Новая',
    }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  const edits = db.prepare(`
    SELECT new_full_name, status
    FROM student_profile_edits
    WHERE student_id = ?
    ORDER BY id ASC
  `).all(fixtureIds.studentOneId)
  db.close()
  assert.deepEqual(edits, [
    { new_full_name: '  Анна Новая  ', status: 'rejected' },
    { new_full_name: 'Анна Последняя', status: 'pending' },
  ])
})

test('POST /api/student/profile-edit доступен completed и запрещён в другом статусе', async () => {
  const db = new Database(legacyDatabasePath)
  db.prepare(`UPDATE students SET status = 'completed' WHERE id = ?`).run(fixtureIds.studentTwoId)
  db.close()

  const completed = await postJson(
    '/api/student/profile-edit',
    {
      telegram_id: 3002,
      full_name: 'Мария Новая',
      phone: '+79992223344',
    },
    3002,
  )
  assert.equal(completed.response.status, 200)
  assert.deepEqual(completed.body, { ok: true })

  const moderationDb = new Database(legacyDatabasePath)
  moderationDb.prepare(`UPDATE students SET status = 'moderation' WHERE id = ?`).run(fixtureIds.studentTwoId)
  moderationDb.close()
  const moderation = await postJson(
    '/api/student/profile-edit',
    {
      telegram_id: 3002,
      full_name: 'Мария Ещё Новее',
      phone: '+79993334455',
    },
    3002,
  )
  assert.equal(moderation.response.status, 403)
  assert.deepEqual(moderation.body, {
    ok: false,
    error: 'Редактирование профиля недоступно в текущем статусе.',
  })

  const restoreDb = new Database(legacyDatabasePath)
  restoreDb.prepare(`UPDATE students SET status = 'studying' WHERE id = ?`).run(fixtureIds.studentTwoId)
  restoreDb.close()
})

test('POST /api/student/profile-edit сохраняет validation, auth и role ошибки', async (context) => {
  const validBody = {
    telegram_id: 3001,
    full_name: 'Анна Ученица',
    phone: '+79990000001',
  }
  for (const [name, patch] of [
    ['короткое имя', { full_name: 'А' }],
    ['короткий телефон', { phone: '1234' }],
    ['длинное метро', { metro: 'x'.repeat(81) }],
  ]) {
    await context.test(name, async () => {
      const { response, body } = await postJson(
        '/api/student/profile-edit',
        { ...validBody, ...patch },
        3001,
      )
      assert.equal(response.status, 400)
      assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
    })
  }

  await context.test('validation выполняется до credential', async () => {
    const { response, body } = await postJson('/api/student/profile-edit', {
      telegram_id: 3001,
      full_name: 'А',
      phone: '+79990000001',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await postJson('/api/student/profile-edit', validBody)
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await postJson('/api/student/profile-edit', validBody, 3002)
    assert.equal(response.status, 403)
  })

  await context.test('пользователь не найден', async () => {
    const { response, body } = await postJson(
      '/api/student/profile-edit',
      { ...validBody, telegram_id: 9999 },
      9999,
    )
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не ученик', async () => {
    const { response, body } = await postJson(
      '/api/student/profile-edit',
      { ...validBody, telegram_id: 2001 },
      2001,
    )
    assert.equal(response.status, 403)
    assert.deepEqual(body, { ok: false, error: 'Только ученики могут редактировать профиль.' })
  })
})

test('GET /api/admin/profile-edits возвращает только pending-заявки от новых к старым', async () => {
  const setupDb = new Database(legacyDatabasePath)
  setupDb.prepare(`
    UPDATE student_profile_edits SET created_at = '2026-09-23 12:00:00'
    WHERE student_id = ? AND status = 'pending'
  `).run(fixtureIds.studentOneId)
  setupDb.prepare(`
    UPDATE student_profile_edits SET created_at = '2026-09-23 13:00:00'
    WHERE student_id = ? AND status = 'pending'
  `).run(fixtureIds.studentTwoId)
  const pending = setupDb.prepare(`
    SELECT id, student_id FROM student_profile_edits
    WHERE status = 'pending'
    ORDER BY created_at DESC
  `).all()
  setupDb.close()

  const { response, body } = await getJson('/api/admin/profile-edits?telegram_id=1001', 1001)
  assert.equal(response.status, 200)
  assert.deepEqual(body, {
    ok: true,
    data: {
      edits: [
        {
          id: pending[0].id,
          student_id: fixtureIds.studentTwoId,
          new_full_name: 'Мария Новая',
          new_phone: '+79992223344',
          new_metro: null,
          created_at: '2026-09-23 13:00:00',
          current_full_name: 'Мария Ученица',
          current_phone: '+79990000002',
          current_metro: 'Северная',
          telegram_id: 3002,
        },
        {
          id: pending[1].id,
          student_id: fixtureIds.studentOneId,
          new_full_name: 'Анна Последняя',
          new_phone: '+79991112233',
          new_metro: 'Новая',
          created_at: '2026-09-23 12:00:00',
          current_full_name: 'Анна Ученица',
          current_phone: '+79990000001',
          current_metro: 'Центральная',
          telegram_id: 3001,
        },
      ],
    },
  })
})

test('GET /api/admin/profile-edits поддерживает web-session', async () => {
  const response = await fetch(`${baseUrl}/api/admin/profile-edits?telegram_id=1001`, {
    headers: { 'X-Web-Session': testAdminWebSessionToken },
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.edits.length, 2)
})

test('GET /api/admin/profile-edits сохраняет validation, auth и role ошибки', async (context) => {
  await context.test('нет telegram_id', async () => {
    const { response, body } = await getJson('/api/admin/profile-edits')
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await getJson('/api/admin/profile-edits?telegram_id=1001')
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await getJson('/api/admin/profile-edits?telegram_id=1001', 3001)
    assert.equal(response.status, 403)
  })

  await context.test('пользователь не найден', async () => {
    const { response, body } = await getJson('/api/admin/profile-edits?telegram_id=9999', 9999)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не администратор', async () => {
    const { response, body } = await getJson('/api/admin/profile-edits?telegram_id=3001', 3001)
    assert.equal(response.status, 403)
    assert.deepEqual(body, { ok: false, error: 'Доступ только для администраторов.' })
  })
})

test('POST /api/admin/profile-edits/:id одобряет заявку и обновляет профиль атомарно', async () => {
  const setupDb = new Database(legacyDatabasePath, { readonly: true })
  const edit = setupDb.prepare(`
    SELECT id FROM student_profile_edits
    WHERE student_id = ? AND status = 'pending'
  `).get(fixtureIds.studentTwoId)
  setupDb.close()

  const { response, body } = await postJson(
    `/api/admin/profile-edits/${edit.id}`,
    { telegram_id: 1001, action: 'approve' },
    1001,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  const storedEdit = db.prepare(`
    SELECT status, admin_comment, reviewed_at, reviewed_by_telegram_id
    FROM student_profile_edits WHERE id = ?
  `).get(edit.id)
  const student = db.prepare(`
    SELECT full_name, phone, metro FROM students WHERE id = ?
  `).get(fixtureIds.studentTwoId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notification = db.prepare(`
    SELECT id FROM app_notifications
    WHERE kind = 'profile_edit_approved'
  `).get()
  db.close()

  assert.equal(storedEdit.status, 'approved')
  assert.equal(storedEdit.admin_comment, null)
  assert.ok(storedEdit.reviewed_at)
  assert.equal(storedEdit.reviewed_by_telegram_id, 1001)
  assert.deepEqual(student, {
    full_name: 'Мария Новая',
    phone: '+79992223344',
    metro: null,
  })
  assert.deepEqual(audit, {
    action: 'profile_edit_approved',
    meta: JSON.stringify({ edit_id: edit.id }),
  })
  assert.equal(notification, undefined)
})

test('POST /api/admin/profile-edits/:id отклоняет заявку через web-session', async () => {
  const setupDb = new Database(legacyDatabasePath, { readonly: true })
  const edit = setupDb.prepare(`
    SELECT id FROM student_profile_edits
    WHERE student_id = ? AND status = 'pending'
  `).get(fixtureIds.studentOneId)
  setupDb.close()

  const response = await fetch(`${baseUrl}/api/admin/profile-edits/${edit.id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Web-Session': testAdminWebSessionToken,
    },
    body: JSON.stringify({
      telegram_id: 1001,
      action: 'reject',
      comment: 'Оставьте текущее имя',
    }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  const storedEdit = db.prepare(`
    SELECT status, admin_comment, reviewed_at, reviewed_by_telegram_id
    FROM student_profile_edits WHERE id = ?
  `).get(edit.id)
  const student = db.prepare(`
    SELECT full_name, phone, metro FROM students WHERE id = ?
  `).get(fixtureIds.studentOneId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log ORDER BY id DESC LIMIT 1
  `).get()
  const notification = db.prepare(`
    SELECT id FROM app_notifications
    WHERE kind = 'profile_edit_rejectd'
  `).get()
  db.close()

  assert.equal(storedEdit.status, 'rejected')
  assert.equal(storedEdit.admin_comment, 'Оставьте текущее имя')
  assert.ok(storedEdit.reviewed_at)
  assert.equal(storedEdit.reviewed_by_telegram_id, 1001)
  assert.deepEqual(student, {
    full_name: 'Анна Ученица',
    phone: '+79990000001',
    metro: 'Центральная',
  })
  assert.deepEqual(audit, {
    action: 'profile_edit_rejectd',
    meta: JSON.stringify({ edit_id: edit.id }),
  })
  assert.equal(notification, undefined)
})

test('POST /api/admin/profile-edits/:id сохраняет validation, auth и role ошибки', async (context) => {
  const validBody = { telegram_id: 1001, action: 'approve' }

  await context.test('некорректные id, action и comment проверяются до credential', async () => {
    for (const [path, body] of [
      ['/api/admin/profile-edits/nope', validBody],
      ['/api/admin/profile-edits/1', { telegram_id: 1001, action: 'archive' }],
      ['/api/admin/profile-edits/1', { ...validBody, comment: 'x'.repeat(501) }],
    ]) {
      const result = await postJson(path, body)
      assert.equal(result.response.status, 400)
      assert.deepEqual(result.body, { ok: false, error: 'Некорректные параметры запроса.' })
    }
  })

  await context.test('нет credential', async () => {
    const result = await postJson('/api/admin/profile-edits/999999', validBody)
    assert.equal(result.response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const result = await postJson('/api/admin/profile-edits/999999', validBody, 3001)
    assert.equal(result.response.status, 403)
  })

  await context.test('пользователь не найден', async () => {
    const result = await postJson(
      '/api/admin/profile-edits/999999',
      { telegram_id: 9999, action: 'approve' },
      9999,
    )
    assert.equal(result.response.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не администратор', async () => {
    const result = await postJson(
      '/api/admin/profile-edits/999999',
      { telegram_id: 3001, action: 'approve' },
      3001,
    )
    assert.equal(result.response.status, 403)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Доступ только для администраторов.',
    })
  })

  await context.test('заявка отсутствует или уже обработана', async () => {
    const result = await postJson('/api/admin/profile-edits/999999', validBody, 1001)
    assert.equal(result.response.status, 400)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Заявка не найдена или уже обработана.',
    })
  })
})

test('POST /api/teacher/review принимает работу и создаёт все побочные эффекты', async () => {
  const homeworkId = createPendingHomework({
    studentId: fixtureIds.studentOneId,
    lessonNumber: 5,
  })
  const response = await fetch(`${baseUrl}/api/teacher/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Web-Session': testTeacherWebSessionToken,
    },
    body: JSON.stringify({
      telegram_id: 2001,
      homework_id: homeworkId,
      rating: '5',
      comment: '  Отличная техника  ',
    }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  const homework = db.prepare('SELECT status FROM homeworks WHERE id = ?').get(homeworkId)
  const review = db.prepare(`
    SELECT teacher_id, rating, comment, status
    FROM homework_reviews WHERE homework_id = ? ORDER BY id DESC LIMIT 1
  `).get(homeworkId)
  const audit = db.prepare(`
    SELECT action, meta FROM audit_log
    WHERE action = 'teacher_review_homework' ORDER BY id DESC LIMIT 1
  `).get()
  const chat = db.prepare(`
    SELECT student_id, sender_user_id, text_content, content_type, file_id
    FROM chat_messages WHERE student_id = ? ORDER BY id DESC LIMIT 1
  `).get(fixtureIds.studentOneId)
  const notifications = db.prepare(`
    SELECT kind, body, payload FROM app_notifications
    WHERE user_id = (SELECT user_id FROM students WHERE id = ?)
      AND kind IN ('homework_review', 'feedback_invite')
    ORDER BY id DESC LIMIT 2
  `).all(fixtureIds.studentOneId)
  const invite = db.prepare(`
    SELECT student_id, milestone, delivery_status
    FROM feedback_invites WHERE student_id = ? AND milestone = 5
  `).get(fixtureIds.studentOneId)
  db.close()

  assert.equal(homework.status, 'approved')
  assert.deepEqual(review, {
    teacher_id: 1,
    rating: 5,
    comment: 'Отличная техника',
    status: 'approved',
  })
  assert.deepEqual(audit, {
    action: 'teacher_review_homework',
    meta: JSON.stringify({ homework_id: homeworkId, status: 'approved' }),
  })
  assert.deepEqual(chat, {
    student_id: fixtureIds.studentOneId,
    sender_user_id: 2,
    text_content: '✅ Проверка ДЗ (урок №5): принято. Оценка: 5/5. Комментарий: Отличная техника',
    content_type: 'system',
    file_id: null,
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
    student_id: fixtureIds.studentOneId,
    milestone: 5,
    delivery_status: 'pending',
  })
})

test('POST /api/teacher/review возвращает работу на доработку по комментарию', async () => {
  const homeworkId = createPendingHomework({
    studentId: fixtureIds.studentOneId,
    lessonNumber: 6,
  })
  const { response, body } = await postJson(
    '/api/teacher/review',
    { telegram_id: 2001, homework_id: homeworkId, comment: '  Исправьте форму  ' },
    2001,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  const homework = db.prepare('SELECT status FROM homeworks WHERE id = ?').get(homeworkId)
  const review = db.prepare(`
    SELECT rating, comment, status FROM homework_reviews
    WHERE homework_id = ? ORDER BY id DESC LIMIT 1
  `).get(homeworkId)
  const chat = db.prepare(`
    SELECT text_content FROM chat_messages WHERE student_id = ? ORDER BY id DESC LIMIT 1
  `).get(fixtureIds.studentOneId)
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
  assert.deepEqual(chat, {
    text_content: '❌ Проверка ДЗ (урок №6): нужна доработка. Комментарий: Исправьте форму',
  })
  assert.deepEqual(notification, {
    body: 'Задание по урок №6 нужно доработать.\nКомментарий: Исправьте форму',
    payload: JSON.stringify({ homework_id: homeworkId, status: 'revision' }),
  })
})

test('POST /api/teacher/review позволяет администратору проверить любого активного ученика', async () => {
  const homeworkId = createPendingHomework({
    studentId: fixtureIds.studentTwoId,
    lessonNumber: 7,
    isBonus: 1,
  })
  const { response, body } = await postJson(
    '/api/teacher/review',
    { telegram_id: 1001, homework_id: homeworkId, rating: 4 },
    1001,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(body, { ok: true })

  const db = new Database(legacyDatabasePath, { readonly: true })
  const teacher = db.prepare(`
    SELECT t.full_name, t.user_id
    FROM teachers t JOIN users u ON u.id = t.user_id
    WHERE u.telegram_id = 1001
  `).get()
  const review = db.prepare(`
    SELECT hr.rating, hr.status, t.user_id AS teacher_user_id
    FROM homework_reviews hr JOIN teachers t ON t.id = hr.teacher_id
    WHERE hr.homework_id = ?
  `).get(homeworkId)
  const invite = db.prepare(`
    SELECT id FROM feedback_invites WHERE student_id = ? AND milestone = 7
  `).get(fixtureIds.studentTwoId)
  db.close()

  assert.deepEqual(teacher, { full_name: 'Админ Тестовый', user_id: 1 })
  assert.deepEqual(review, { rating: 4, status: 'approved', teacher_user_id: 1 })
  assert.equal(invite, undefined)
})

test('POST /api/teacher/review сохраняет validation, auth и domain-ошибки', async (context) => {
  await context.test('body проверяется до credential', async () => {
    for (const body of [
      { telegram_id: 2001, homework_id: 0, rating: 5 },
      { telegram_id: 2001, homework_id: 1, rating: 6 },
      { telegram_id: 2001, homework_id: 1, comment: 123 },
    ]) {
      const result = await postJson('/api/teacher/review', body)
      assert.equal(result.response.status, 400)
      assert.deepEqual(result.body, { ok: false, error: 'Некорректные параметры запроса.' })
    }
  })

  await context.test('нет credential', async () => {
    const result = await postJson('/api/teacher/review', {
      telegram_id: 2001,
      homework_id: 999999,
      rating: 5,
    })
    assert.equal(result.response.status, 401)
  })

  await context.test('пользователь не найден', async () => {
    const result = await postJson(
      '/api/teacher/review',
      { telegram_id: 9999, homework_id: 999999, rating: 5 },
      9999,
    )
    assert.equal(result.response.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('пользователь не преподаватель', async () => {
    const result = await postJson(
      '/api/teacher/review',
      { telegram_id: 3001, homework_id: 999999, rating: 5 },
      3001,
    )
    assert.equal(result.response.status, 403)
    assert.deepEqual(result.body, { ok: false, error: 'Доступ только для преподавателей.' })
  })

  await context.test('задание не найдено', async () => {
    const result = await postJson(
      '/api/teacher/review',
      { telegram_id: 2001, homework_id: 999999, rating: 5 },
      2001,
    )
    assert.equal(result.response.status, 404)
    assert.deepEqual(result.body, { ok: false, error: 'Задание не найдено.' })
  })

  await context.test('задание уже проверено', async () => {
    const result = await postJson(
      '/api/teacher/review',
      { telegram_id: 2001, homework_id: fixtureIds.approvedHomeworkId, rating: 5 },
      2001,
    )
    assert.equal(result.response.status, 409)
    assert.deepEqual(result.body, { ok: false, error: 'Это задание уже проверено.' })
  })

  await context.test('ученик не назначен преподавателю', async () => {
    const homeworkId = createPendingHomework({
      studentId: fixtureIds.studentTwoId,
      lessonNumber: 8,
    })
    const result = await postJson(
      '/api/teacher/review',
      { telegram_id: 2001, homework_id: homeworkId, rating: 5 },
      2001,
    )
    assert.equal(result.response.status, 403)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Ученик не прикреплён к этому преподавателю.',
    })
  })

  await context.test('нужна оценка или непустой комментарий', async () => {
    const homeworkId = createPendingHomework({
      studentId: fixtureIds.studentOneId,
      lessonNumber: 9,
    })
    const result = await postJson(
      '/api/teacher/review',
      { telegram_id: 2001, homework_id: homeworkId, comment: '   ' },
      2001,
    )
    assert.equal(result.response.status, 400)
    assert.deepEqual(result.body, {
      ok: false,
      error: 'Укажите оценку или напишите комментарий.',
    })
  })
})

test('legacy SEC-001: публичный профиль сейчас возвращает работы во всех статусах', async () => {
  const studentsResult = await getJson('/api/guest/portfolio-students')
  const student = studentsResult.body.data.students.find((item) => item.full_name === 'Анна Ученица')
  const { response, body } = await getJson(`/api/guest/students/${student.id}/portfolio`)

  assert.equal(response.status, 200)
  assert.deepEqual(
    new Set(body.data.homeworks.map((homework) => homework.status)),
    new Set(['approved', 'pending', 'revision']),
  )
})

test('legacy SEC-002: преподаватель сейчас получает чаты всех активных учеников', async () => {
  const { response, body } = await getJson('/api/chats/students?telegram_id=2001', 2001)
  assert.equal(response.status, 200)
  assert.equal(body.data.students.length, 2)
})

test('legacy BUG-001: фильтр completed сейчас возвращает и studying-учеников', async () => {
  const { response, body } = await getJson('/api/admin/students?telegram_id=1001&status=completed', 1001)
  assert.equal(response.status, 200)
  assert.equal(body.data.students.length, 2)
  assert.ok(body.data.students.every((student) => student.status === 'studying'))
})

test('владелец, назначенный преподаватель и администратор читают файл работы', async () => {
  const path = `/api/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=`
  const owner = await getResponse(`${path}3001`, 3001)
  const teacher = await getResponse(`${path}2001`, 2001)
  const admin = await getResponse(`${path}1001`, 1001)

  assert.equal(owner.status, 200)
  assert.equal(teacher.status, 200)
  assert.equal(admin.status, 200)
  assert.equal(owner.headers.get('content-type'), 'image/jpeg')
  assert.equal(owner.headers.get('cross-origin-resource-policy'), 'cross-origin')
  assert.equal(await owner.text(), testImageSvg)
})

test('авторизованный файл поддерживает preview и web-session', async () => {
  const preview = await getResponse(
    `/api/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=3001&preview=1`,
    3001,
  )
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual([...new Uint8Array(await preview.arrayBuffer()).slice(0, 2)], [0xff, 0xd8])

  const webResponse = await fetch(
    `${baseUrl}/api/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=3001`,
    { headers: { 'X-Web-Session': testWebSessionToken } },
  )
  assert.equal(webResponse.status, 200)
  assert.equal(await webResponse.text(), testImageSvg)
})

test('посторонний ученик и неназначенный преподаватель не читают файл работы', async () => {
  const student = await getJson(
    `/api/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=3002`,
    3002,
  )
  const teacher = await getJson(
    `/api/homeworks/${fixtureIds.secondStudentHomeworkId}/file?telegram_id=2001`,
    2001,
  )

  assert.equal(student.response.status, 403)
  assert.deepEqual(student.body, { ok: false, error: 'Нет доступа к этому файлу.' })
  assert.equal(teacher.response.status, 403)
  assert.deepEqual(teacher.body, { ok: false, error: 'Нет доступа к этому файлу.' })
})

test('авторизованный файл сохраняет validation, auth и not-found ошибки', async (context) => {
  await context.test('некорректный id', async () => {
    const { response, body } = await getJson('/api/homeworks/nope/file?telegram_id=3001', 3001)
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('некорректный preview', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=3001&preview=0`,
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await getJson(
      `/api/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=3001`,
    )
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await getJson(
      `/api/homeworks/${fixtureIds.pendingHomeworkId}/file?telegram_id=3001`,
      3002,
    )
    assert.equal(response.status, 403)
  })

  await context.test('задание не существует', async () => {
    const { response, body } = await getJson('/api/homeworks/999999/file?telegram_id=3001', 3001)
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Задание не найдено.' })
  })

  await context.test('у задания нет файла', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.revisionHomeworkId}/file?telegram_id=3001`,
      3001,
    )
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Вложение недоступно для скачивания.' })
  })
})

test('владелец, назначенный преподаватель и администратор читают файл исправления', async () => {
  const path = `/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=`
  for (const telegramId of [3001, 2001, 1001]) {
    const response = await getResponse(`${path}${telegramId}`, telegramId)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/jpeg')
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')
    assert.equal(await response.text(), testImageSvg)
  }
})

test('файл исправления поддерживает preview и web-session', async () => {
  const preview = await getResponse(
    `/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=3001&preview=true`,
    3001,
  )
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual([...new Uint8Array(await preview.arrayBuffer()).slice(0, 2)], [0xff, 0xd8])

  const webResponse = await fetch(
    `${baseUrl}/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=3001`,
    { headers: { 'X-Web-Session': testWebSessionToken } },
  )
  assert.equal(webResponse.status, 200)
  assert.equal(await webResponse.text(), testImageSvg)
})

test('посторонний ученик не читает файл исправления', async () => {
  const { response, body } = await getJson(
    `/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=3002`,
    3002,
  )
  assert.equal(response.status, 403)
  assert.deepEqual(body, { ok: false, error: 'Нет доступа к этому файлу.' })
})

test('файл исправления сохраняет validation, auth и not-found ошибки', async (context) => {
  await context.test('некорректный id', async () => {
    const { response, body } = await getJson(
      '/api/homeworks/nope/revision/file?telegram_id=3001',
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('некорректный preview', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=3001&preview=0`,
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await getJson(
      `/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=3001`,
    )
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await getJson(
      `/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=3001`,
      3002,
    )
    assert.equal(response.status, 403)
  })

  await context.test('файл исправления отсутствует', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.pendingHomeworkId}/revision/file?telegram_id=3002`,
      3002,
    )
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Файл исправления не найден.' })
  })

  await context.test('подписанный неизвестный пользователь не получает файл', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.revisionHomeworkId}/revision/file?telegram_id=9999`,
      9999,
    )
    assert.equal(response.status, 403)
    assert.deepEqual(body, { ok: false, error: 'Нет доступа к этому файлу.' })
  })
})

test('владелец, назначенный преподаватель и администратор читают вложение работы', async () => {
  const path = `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=`
  for (const telegramId of [3001, 2001, 1001]) {
    const response = await getResponse(`${path}${telegramId}`, telegramId)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/jpeg')
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin')
    assert.equal(await response.text(), testImageSvg)
  }
})

test('авторизованное вложение поддерживает preview и web-session', async () => {
  const preview = await getResponse(
    `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3001&preview=1`,
    3001,
  )
  assert.equal(preview.status, 200)
  assert.equal(preview.headers.get('content-type'), 'image/jpeg')
  assert.deepEqual([...new Uint8Array(await preview.arrayBuffer()).slice(0, 2)], [0xff, 0xd8])

  const webResponse = await fetch(
    `${baseUrl}/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3001`,
    { headers: { 'X-Web-Session': testWebSessionToken } },
  )
  assert.equal(webResponse.status, 200)
  assert.equal(await webResponse.text(), testImageSvg)
})

test('посторонний ученик и неназначенный преподаватель не читают вложение', async () => {
  const student = await getJson(
    `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3002`,
    3002,
  )
  assert.equal(student.response.status, 403)
  assert.deepEqual(student.body, { ok: false, error: 'Нет доступа к этому файлу.' })

  const teacher = await getJson(
    `/api/homeworks/${fixtureIds.secondStudentHomeworkId}/attachments/${fixtureIds.secondStudentAttachmentId}/file?telegram_id=2001`,
    2001,
  )
  assert.equal(teacher.response.status, 403)
  assert.deepEqual(teacher.body, { ok: false, error: 'Нет доступа к этому файлу.' })
})

test('авторизованное вложение сохраняет validation, auth и not-found ошибки', async (context) => {
  await context.test('некорректный homework id', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/nope/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3001`,
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('некорректный attachment id', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/nope/file?telegram_id=3001`,
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('вложение не принадлежит работе из URL', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.pendingHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3001`,
      3001,
    )
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Вложение не найдено.' })
  })

  await context.test('вложение не существует', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/999999/file?telegram_id=3001`,
      3001,
    )
    assert.equal(response.status, 404)
    assert.deepEqual(body, { ok: false, error: 'Вложение не найдено.' })
  })

  await context.test('некорректный preview', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3001&preview=0`,
      3001,
    )
    assert.equal(response.status, 400)
    assert.deepEqual(body, { ok: false, error: 'Некорректные параметры запроса.' })
  })

  await context.test('нет credential', async () => {
    const { response } = await getJson(
      `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3001`,
    )
    assert.equal(response.status, 401)
  })

  await context.test('credential не совпадает', async () => {
    const { response } = await getJson(
      `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=3001`,
      3002,
    )
    assert.equal(response.status, 403)
  })

  await context.test('подписанный неизвестный пользователь не получает вложение', async () => {
    const { response, body } = await getJson(
      `/api/homeworks/${fixtureIds.approvedHomeworkId}/attachments/${fixtureIds.localAttachmentId}/file?telegram_id=9999`,
      9999,
    )
    assert.equal(response.status, 403)
    assert.deepEqual(body, { ok: false, error: 'Нет доступа к этому файлу.' })
  })
})

test('legacy SEC-001: публичная файловая ручка сейчас отдаёт pending-работу', async () => {
  const response = await getResponse(`/api/guest/homeworks/${fixtureIds.pendingHomeworkId}/file`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), testImageSvg)
})

test.todo('SEC-001: публичный профиль должен возвращать только approved-работы')
test.todo('SEC-001: публичная файловая ручка должна отклонять не-approved работу')
test.todo('SEC-002: преподаватель должен получать чаты только назначенных учеников')
test.todo('SEC-003: снятие роли преподавателя должно сохранять профиль и исторические проверки')
test.todo('BUG-001: admin/students должен точно фильтровать studying и completed')
test.todo('BUG-002: обработка profile edit должна уведомлять ученика')
test.todo('BUG-003: admin/update-student должен быть атомарным при domain-ошибке')
