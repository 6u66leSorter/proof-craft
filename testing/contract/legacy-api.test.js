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
  writeFileSync(pendingFilePath, 'pending file')
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
    VALUES (?, ?, 0, 'text', ?, ?, ?, ?)
  `)
  const approvedHomeworkId = Number(
    insertHomework.run(studentOneId, 1, approvedFilePath, 'Одобренная работа', 'approved', 'Фейд').lastInsertRowid,
  )
  const pendingHomeworkId = Number(
    insertHomework.run(studentOneId, 2, pendingFilePath, 'Работа на проверке', 'pending', 'Кроп').lastInsertRowid,
  )
  insertHomework.run(studentOneId, 3, null, 'Работа на доработке', 'revision', 'Классика')
  const secondStudentHomeworkId = Number(
    insertHomework.run(studentTwoId, 1, secondStudentFilePath, 'Работа второго ученика', 'approved', 'Бокс').lastInsertRowid,
  )

  db.prepare(`
    UPDATE users SET vk_user_id = ? WHERE id = ?
  `).run(7001, studentOneUserId)
  db.prepare(`
    UPDATE students SET student_track = 'intern', about_me = ?, avatar_file_id = ? WHERE id = ?
  `).run('О студенте', approvedFilePath, studentOneId)
  const insertReview = db.prepare(`
    INSERT INTO homework_reviews (homework_id, teacher_id, rating, status)
    VALUES (?, ?, ?, 'approved')
  `)
  insertReview.run(approvedHomeworkId, teacherId, 4)
  insertReview.run(approvedHomeworkId, teacherId, 5)
  db.prepare(`
    INSERT INTO app_notifications (user_id, kind, body)
    VALUES (?, 'contract', 'Непрочитанное')
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
    pendingHomeworkId,
    secondStudentHomeworkId,
    studentOneId,
    studentTwoId,
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
          works_count: 3,
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
  assert.equal(student.works_count, 3)
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
  assert.equal(await owner.text(), 'pending file')
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
  assert.equal(teacher.response.status, 403)
})

test('legacy SEC-001: публичная файловая ручка сейчас отдаёт pending-работу', async () => {
  const response = await getResponse(`/api/guest/homeworks/${fixtureIds.pendingHomeworkId}/file`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'pending file')
})

test.todo('SEC-001: публичный профиль должен возвращать только approved-работы')
test.todo('SEC-001: публичная файловая ручка должна отклонять не-approved работу')
test.todo('SEC-002: преподаватель должен получать чаты только назначенных учеников')
test.todo('BUG-001: admin/students должен точно фильтровать studying и completed')
