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
test.todo('BUG-001: admin/students должен точно фильтровать studying и completed')
