import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
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
let serverOutput = ''
const testBotToken = '123456:test-contract-token'
const testVkSecret = 'legacy-contract-vk-secret'
const testWebSessionToken = 'legacy-contract-web-session'
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
  const pendingFilePath = join(uploadsDir, 'pending.txt')
  const secondStudentFilePath = join(uploadsDir, 'second-student.txt')
  writeFileSync(approvedFilePath, 'approved file')
  writeFileSync(pendingFilePath, testImageSvg)
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
    'telegram_revision_file_12345',
    revisionHomeworkId,
  )
  updateHomework.run('2026-09-19 12:00:00', '2026-09-19 12:00:00', null, null, approvedDocumentHomeworkId)

  db.prepare(`
    UPDATE users SET vk_user_id = ? WHERE id = ?
  `).run(7001, studentOneUserId)
  db.prepare(`
    UPDATE students SET student_track = 'intern', about_me = ?, avatar_file_id = ? WHERE id = ?
  `).run('О студенте', approvedFilePath, studentOneId)
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
  `).run(approvedHomeworkId, approvedFilePath).lastInsertRowid)
  const telegramAttachmentId = Number(db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order, created_at)
    VALUES (?, 'telegram_attachment_file_12345', 'photo', 1, '2026-09-20 12:20:00')
  `).run(approvedHomeworkId).lastInsertRowid)
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
    studentCommentId,
    teacherCommentId,
    approvedFilePath,
    pendingFilePath,
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  apiProcess.stdout.on('data', (chunk) => { serverOutput += String(chunk) })
  apiProcess.stderr.on('data', (chunk) => { serverOutput += String(chunk) })

  await waitForHealth()
  fixtureIds = seedLegacyDatabase(join(isolatedProject, 'data', 'barber.db'))
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
          revision_has_local_file: false,
          revision_has_telegram_file: true,
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
  assert.equal(await response.text(), 'approved file')
})

test('GET /api/guest/students/:id/avatar сохраняет ошибки недоступного аватара', async () => {
  const missing = await getJson(`/api/guest/students/${fixtureIds.studentTwoId}/avatar`)
  assert.equal(missing.response.status, 404)
  assert.deepEqual(missing.body, { ok: false, error: 'Аватар не установлен.' })

  const invalid = await getJson('/api/guest/students/nope/avatar')
  assert.equal(invalid.response.status, 400)
  assert.deepEqual(invalid.body, { ok: false, error: 'Некорректные параметры запроса.' })
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

test('legacy SEC-001: публичная файловая ручка сейчас отдаёт pending-работу', async () => {
  const response = await getResponse(`/api/guest/homeworks/${fixtureIds.pendingHomeworkId}/file`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), testImageSvg)
})

test.todo('SEC-001: публичный профиль должен возвращать только approved-работы')
test.todo('SEC-001: публичная файловая ручка должна отклонять не-approved работу')
test.todo('SEC-002: преподаватель должен получать чаты только назначенных учеников')
test.todo('BUG-001: admin/students должен точно фильтровать studying и completed')
