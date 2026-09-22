import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm, symlink } from 'node:fs/promises'
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
      (student_id, lesson_number, is_bonus, content_type, text_content, status, haircut_name)
    VALUES (?, ?, 0, 'text', ?, ?, ?)
  `)
  insertHomework.run(studentOneId, 1, 'Одобренная работа', 'approved', 'Фейд')
  insertHomework.run(studentOneId, 2, 'Работа на проверке', 'pending', 'Кроп')
  insertHomework.run(studentOneId, 3, 'Работа на доработке', 'revision', 'Классика')
  insertHomework.run(studentTwoId, 1, 'Работа второго ученика', 'approved', 'Бокс')

  db.close()
  return { studentOneId, studentTwoId }
}

const getJson = async (path) => {
  const response = await fetch(`${baseUrl}${path}`)
  const body = await response.json()
  return { response, body }
}

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
      TG_WEBAPP_AUTH: 'off',
      API_PREFIX_STRIP_REWRITE: '0',
      BOT_TOKEN: '',
      TELEGRAM_BOT_TOKEN: '',
      VITE_TELEGRAM_BOT_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  apiProcess.stdout.on('data', (chunk) => { serverOutput += String(chunk) })
  apiProcess.stderr.on('data', (chunk) => { serverOutput += String(chunk) })

  await waitForHealth()
  seedLegacyDatabase(join(isolatedProject, 'data', 'barber.db'))
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
  const { response, body } = await getJson('/api/session?telegram_id=3001')
  assert.equal(response.status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.role, 'student')
  assert.deepEqual(body.data.roles, ['student'])
  assert.equal(body.data.student.full_name, 'Анна Ученица')
  assert.equal(body.data.student.teachers.length, 1)
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
  const { response, body } = await getJson('/api/chats/students?telegram_id=2001')
  assert.equal(response.status, 200)
  assert.equal(body.data.students.length, 2)
})

test('legacy BUG-001: фильтр completed сейчас возвращает и studying-учеников', async () => {
  const { response, body } = await getJson('/api/admin/students?telegram_id=1001&status=completed')
  assert.equal(response.status, 200)
  assert.equal(body.data.students.length, 2)
  assert.ok(body.data.students.every((student) => student.status === 'studying'))
})

test.todo('SEC-001: публичный профиль должен возвращать только approved-работы')
test.todo('SEC-002: преподаватель должен получать чаты только назначенных учеников')
test.todo('BUG-001: admin/students должен точно фильтровать studying и completed')
