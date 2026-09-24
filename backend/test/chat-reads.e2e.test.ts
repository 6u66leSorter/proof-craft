import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import multipart from '@fastify/multipart'
import { Test } from '@nestjs/testing'
import { AppModule } from '../src/app.module.js'
import { createTestDatabase } from './support/test-database.js'
import { getMultipartOptions } from '../src/common/multipart-options.js'

const botToken = '123456:nest-chat-read-token'
const vkSecret = 'nest-chat-read-vk-secret'
const studentTelegramId = 9401
const secondStudentTelegramId = 9402
const teacherTelegramId = 9403
const unassignedTeacherTelegramId = 9404
const adminTelegramId = 9405
const guestTelegramId = 9406
const unknownTelegramId = 9499
const studentVkUserId = 19401
const studentWebSession = 'nest-chat-read-web-session'
const chatFileBody = 'chat attachment body'

type FixtureIds = {
  studentId: number
  secondStudentId: number
  studentTextMessageId: number
  teacherFileMessageId: number
  adminMessageId: number
  systemMessageId: number
  guestMessageId: number
}

let temporaryRoot: string
let databasePath: string
let app: NestFastifyApplication
let fixtureIds: FixtureIds

const buildTelegramInitData = (telegramId: number): string => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `chat-read-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: 'Chat' }),
  })
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  params.set(
    'hash',
    crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex'),
  )
  return params.toString()
}

const buildVkLaunchParams = (vkUserId: number): string => {
  const params = new URLSearchParams({
    vk_app_id: '54558405',
    vk_user_id: String(vkUserId),
  })
  const checkString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('&')
  params.set(
    'sign',
    crypto.createHmac('sha256', vkSecret).update(checkString).digest('base64url'),
  )
  return params.toString()
}

const authHeaders = (telegramId: number): Record<string, string> => ({
  'x-telegram-init-data': buildTelegramInitData(telegramId),
})

const multipartMessage = (
  fields: Record<string, string | number>,
  file?: { content: string; filename: string; contentType: string },
): { headers: Record<string, string>; payload: Buffer } => {
  const boundary = `proof-craft-${crypto.randomUUID()}`
  const chunks: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
  }
  if (file) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n${file.content}\r\n`,
    ))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  }
}

const seedChatReads = (databasePath: string): FixtureIds => {
  const db = new Database(databasePath)
  const uploadsDirectory = join(dirname(databasePath), 'uploads')
  mkdirSync(uploadsDirectory, { recursive: true })
  const chatFilePath = join(uploadsDirectory, 'chat-read.txt')
  writeFileSync(chatFilePath, chatFileBody)

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, last_name, role, vk_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const studentUserId = Number(
    insertUser.run(
      studentTelegramId,
      'anna',
      'Анна',
      'Ученица',
      'student',
      studentVkUserId,
    ).lastInsertRowid,
  )
  const secondStudentUserId = Number(
    insertUser.run(secondStudentTelegramId, 'boris', 'Борис', 'Ученик', 'student', null)
      .lastInsertRowid,
  )
  const teacherUserId = Number(
    insertUser.run(teacherTelegramId, 'teacher', 'Ирина', 'Преподаватель', 'teacher', null)
      .lastInsertRowid,
  )
  const unassignedTeacherUserId = Number(
    insertUser.run(
      unassignedTeacherTelegramId,
      'other_teacher',
      'Ольга',
      'Преподаватель',
      'teacher',
      null,
    ).lastInsertRowid,
  )
  const adminUserId = Number(
    insertUser.run(adminTelegramId, 'admin', 'Админ', 'Тестовый', 'admin', null)
      .lastInsertRowid,
  )
  const guestUserId = Number(
    insertUser.run(guestTelegramId, 'helper', null, null, 'guest', null).lastInsertRowid,
  )
  const insertRole = db.prepare(`INSERT INTO user_roles (user_id, role) VALUES (?, ?)`)
  for (const [userId, role] of [
    [studentUserId, 'student'],
    [secondStudentUserId, 'student'],
    [teacherUserId, 'teacher'],
    [unassignedTeacherUserId, 'teacher'],
    [adminUserId, 'admin'],
    [guestUserId, 'guest'],
  ] as const) {
    insertRole.run(userId, role)
  }

  const insertStudent = db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status)
    VALUES (?, ?, '+79990000000', 10, 'studying')
  `)
  const studentId = Number(
    insertStudent.run(studentUserId, 'Анна Ученица').lastInsertRowid,
  )
  const secondStudentId = Number(
    insertStudent.run(secondStudentUserId, 'Борис Ученик').lastInsertRowid,
  )
  const teacherId = Number(
    db.prepare(`INSERT INTO teachers (user_id, full_name) VALUES (?, ?)`)
      .run(teacherUserId, 'Ирина Преподаватель').lastInsertRowid,
  )
  db.prepare(`INSERT INTO teachers (user_id, full_name) VALUES (?, ?)`)
    .run(unassignedTeacherUserId, 'Ольга Преподаватель')
  db.prepare(`INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)`)
    .run(studentId, teacherId)

  const insertMessage = db.prepare(`
    INSERT INTO chat_messages
      (student_id, sender_user_id, text_content, content_type, file_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const studentTextMessageId = Number(
    insertMessage.run(
      studentId,
      studentUserId,
      'Сообщение ученика',
      'text',
      null,
      '2026-09-24 10:00:00',
    ).lastInsertRowid,
  )
  const teacherFileMessageId = Number(
    insertMessage.run(
      studentId,
      teacherUserId,
      'Файл преподавателя',
      'document',
      chatFilePath,
      '2026-09-24 10:01:00',
    ).lastInsertRowid,
  )
  const adminMessageId = Number(
    insertMessage.run(
      studentId,
      adminUserId,
      'Сообщение администратора',
      'text',
      null,
      '2026-09-24 10:02:00',
    ).lastInsertRowid,
  )
  const systemMessageId = Number(
    insertMessage.run(
      studentId,
      adminUserId,
      'Системное сообщение',
      'system',
      null,
      '2026-09-24 10:03:00',
    ).lastInsertRowid,
  )
  const guestMessageId = Number(
    insertMessage.run(
      studentId,
      guestUserId,
      'Сообщение пользователя',
      'text',
      null,
      '2026-09-24 10:04:00',
    ).lastInsertRowid,
  )
  insertMessage.run(
    secondStudentId,
    secondStudentUserId,
    'Второй чат',
    'text',
    null,
    '2026-09-24 11:00:00',
  )

  db.prepare(`
    INSERT INTO web_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', '+1 day'))
  `).run(
    studentUserId,
    crypto.createHash('sha256').update(studentWebSession).digest('hex'),
  )
  db.close()
  return {
    studentId,
    secondStudentId,
    studentTextMessageId,
    teacherFileMessageId,
    adminMessageId,
    systemMessageId,
    guestMessageId,
  }
}

before(async () => {
  const fixture = await createTestDatabase('proof-craft-chat-reads-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  fixtureIds = seedChatReads(fixture.databasePath)
  process.env.DATABASE_URL = `file:${fixture.databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TELEGRAM_BOT_TOKEN = ''
  process.env.VITE_TELEGRAM_BOT_TOKEN = ''
  process.env.TG_WEBAPP_AUTH = 'strict'
  process.env.VK_APP_ID = '54558405'
  process.env.VK_APP_SECRET = vkSecret
  process.env.VK_ID_OFFSET = '10000000000'
  process.env.CHAT_ENABLED = 'true'
  process.env.MAX_HOMEWORK_UPLOAD_MB = '0.001'

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.register(multipart, getMultipartOptions())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  process.env.CHAT_ENABLED = 'true'
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('GET chats/students ограничивает список ролью и исправляет SEC-002', async () => {
  const student = await app.inject({
    method: 'GET',
    url: `/api/chats/students?telegram_id=${studentTelegramId}`,
    headers: authHeaders(studentTelegramId),
  })
  assert.equal(student.statusCode, 200)
  assert.deepEqual(student.json(), {
    ok: true,
    data: {
      students: [
        { id: fixtureIds.studentId, full_name: 'Анна Ученица', status: 'studying' },
      ],
    },
  })

  const teacher = await app.inject({
    method: 'GET',
    url: `/api/chats/students?telegram_id=${teacherTelegramId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(teacher.statusCode, 200)
  assert.deepEqual(teacher.json().data.students, [
    { id: fixtureIds.studentId, full_name: 'Анна Ученица', status: 'studying' },
  ])

  const unassignedTeacher = await app.inject({
    method: 'GET',
    url: `/api/chats/students?telegram_id=${unassignedTeacherTelegramId}`,
    headers: authHeaders(unassignedTeacherTelegramId),
  })
  assert.equal(unassignedTeacher.statusCode, 200)
  assert.deepEqual(unassignedTeacher.json().data.students, [])

  const admin = await app.inject({
    method: 'GET',
    url: `/api/chats/students?telegram_id=${adminTelegramId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(admin.statusCode, 200)
  assert.deepEqual(admin.json().data.students, [
    { id: fixtureIds.studentId, full_name: 'Анна Ученица', status: 'studying' },
    { id: fixtureIds.secondStudentId, full_name: 'Борис Ученик', status: 'studying' },
  ])

  const guest = await app.inject({
    method: 'GET',
    url: `/api/chats/students?telegram_id=${guestTelegramId}`,
    headers: authHeaders(guestTelegramId),
  })
  assert.equal(guest.statusCode, 200)
  assert.deepEqual(guest.json().data.students, [])
})

test('GET chats/messages возвращает последние сообщения по возрастанию с legacy-маппингом', async () => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/chats/messages?telegram_id=${studentTelegramId}&student_id=${fixtureIds.studentId}`,
    headers: authHeaders(studentTelegramId),
  })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json().data.messages, [
    {
      id: fixtureIds.studentTextMessageId,
      student_id: fixtureIds.studentId,
      sender_user_id: response.json().data.messages[0].sender_user_id,
      sender_name: 'Анна Ученица',
      sender_role: 'ученик',
      sender_role_key: 'student',
      sender_role_color: 'var(--gold)',
      sender_telegram_id: studentTelegramId,
      text_content: 'Сообщение ученика',
      content_type: 'text',
      has_file: false,
      created_at: '2026-09-24 10:00:00',
    },
    {
      id: fixtureIds.teacherFileMessageId,
      student_id: fixtureIds.studentId,
      sender_user_id: response.json().data.messages[1].sender_user_id,
      sender_name: 'Ирина Преподаватель',
      sender_role: 'преподаватель',
      sender_role_key: 'teacher',
      sender_role_color: 'var(--success)',
      sender_telegram_id: teacherTelegramId,
      text_content: 'Файл преподавателя',
      content_type: 'document',
      has_file: true,
      created_at: '2026-09-24 10:01:00',
    },
    {
      id: fixtureIds.adminMessageId,
      student_id: fixtureIds.studentId,
      sender_user_id: response.json().data.messages[2].sender_user_id,
      sender_name: 'Админ Тестовый',
      sender_role: 'админ',
      sender_role_key: 'admin',
      sender_role_color: 'var(--danger)',
      sender_telegram_id: adminTelegramId,
      text_content: 'Сообщение администратора',
      content_type: 'text',
      has_file: false,
      created_at: '2026-09-24 10:02:00',
    },
    {
      id: fixtureIds.systemMessageId,
      student_id: fixtureIds.studentId,
      sender_user_id: response.json().data.messages[3].sender_user_id,
      sender_name: 'Система',
      sender_role: 'система',
      sender_role_key: 'system',
      sender_role_color: 'var(--dim)',
      sender_telegram_id: adminTelegramId,
      text_content: 'Системное сообщение',
      content_type: 'system',
      has_file: false,
      created_at: '2026-09-24 10:03:00',
    },
    {
      id: fixtureIds.guestMessageId,
      student_id: fixtureIds.studentId,
      sender_user_id: response.json().data.messages[4].sender_user_id,
      sender_name: '@helper',
      sender_role: 'пользователь',
      sender_role_key: 'user',
      sender_role_color: 'var(--gold)',
      sender_telegram_id: guestTelegramId,
      text_content: 'Сообщение пользователя',
      content_type: 'text',
      has_file: false,
      created_at: '2026-09-24 10:04:00',
    },
  ])

  const limited = await app.inject({
    method: 'GET',
    url: `/api/chats/messages?telegram_id=${studentTelegramId}&student_id=${fixtureIds.studentId}&limit=2`,
    headers: authHeaders(studentTelegramId),
  })
  assert.equal(limited.statusCode, 200)
  assert.deepEqual(
    limited.json().data.messages.map((message: { id: number }) => message.id),
    [fixtureIds.systemMessageId, fixtureIds.guestMessageId],
  )
})

test('GET chats/messages применяет общую матрицу доступа', async () => {
  const assigned = await app.inject({
    method: 'GET',
    url: `/api/chats/messages?telegram_id=${teacherTelegramId}&student_id=${fixtureIds.studentId}`,
    headers: authHeaders(teacherTelegramId),
  })
  assert.equal(assigned.statusCode, 200)

  for (const telegramId of [unassignedTeacherTelegramId, secondStudentTelegramId]) {
    const denied = await app.inject({
      method: 'GET',
      url: `/api/chats/messages?telegram_id=${telegramId}&student_id=${fixtureIds.studentId}`,
      headers: authHeaders(telegramId),
    })
    assert.equal(denied.statusCode, 403)
    assert.deepEqual(denied.json(), {
      ok: false,
      error: 'Нет доступа к чату этого ученика.',
    })
  }

  const admin = await app.inject({
    method: 'GET',
    url: `/api/chats/messages?telegram_id=${adminTelegramId}&student_id=${fixtureIds.secondStudentId}`,
    headers: authHeaders(adminTelegramId),
  })
  assert.equal(admin.statusCode, 200)
})

test('chat reads поддерживают web-session, VK и nginx-пути', async () => {
  const web = await app.inject({
    method: 'GET',
    url: `/chats/messages?telegram_id=${studentTelegramId}&student_id=${fixtureIds.studentId}&limit=1`,
    headers: { 'x-web-session': studentWebSession },
  })
  assert.equal(web.statusCode, 200)
  assert.deepEqual(web.json().data.messages.map((message: { id: number }) => message.id), [
    fixtureIds.guestMessageId,
  ])

  const claimedTelegramId = 10_000_000_000 + studentVkUserId
  const vk = await app.inject({
    method: 'GET',
    url: `/chats/students?telegram_id=${claimedTelegramId}`,
    headers: {
      'x-client-platform': 'vk',
      'x-vk-user-id': String(studentVkUserId),
      'x-app-user-id': String(claimedTelegramId),
      'x-vk-launch-params': buildVkLaunchParams(studentVkUserId),
    },
  })
  assert.equal(vk.statusCode, 200)
  assert.deepEqual(vk.json().data.students.map((student: { id: number }) => student.id), [
    fixtureIds.studentId,
  ])
})

test('GET chat message file использует общий storage boundary и матрицу доступа', async () => {
  for (const telegramId of [studentTelegramId, teacherTelegramId, adminTelegramId]) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/messages/${fixtureIds.teacherFileMessageId}/file?telegram_id=${telegramId}`,
      headers: authHeaders(telegramId),
    })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'application/octet-stream')
    assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
    assert.equal(response.body, chatFileBody)
  }

  const web = await app.inject({
    method: 'GET',
    url: `/chats/messages/${fixtureIds.teacherFileMessageId}/file?telegram_id=${studentTelegramId}`,
    headers: { 'x-web-session': studentWebSession },
  })
  assert.equal(web.statusCode, 200)
  assert.equal(web.body, chatFileBody)

  for (const telegramId of [unassignedTeacherTelegramId, secondStudentTelegramId]) {
    const denied = await app.inject({
      method: 'GET',
      url: `/api/chats/messages/${fixtureIds.teacherFileMessageId}/file?telegram_id=${telegramId}`,
      headers: authHeaders(telegramId),
    })
    assert.equal(denied.statusCode, 403)
    assert.deepEqual(denied.json(), {
      ok: false,
      error: 'Нет доступа к этому вложению.',
    })
  }
})

test('chat reads сохраняют validation, auth, not-found и disabled ошибки', async (context) => {
  await context.test('query валидируется до credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/messages?telegram_id=${studentTelegramId}&student_id=nope`,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })

  await context.test('file id валидируется до credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/messages/nope/file?telegram_id=${studentTelegramId}`,
    })
    assert.equal(response.statusCode, 400)
  })

  await context.test('нет credential', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/students?telegram_id=${studentTelegramId}`,
    })
    assert.equal(response.statusCode, 401)
  })

  await context.test('подписанный пользователь не найден', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/students?telegram_id=${unknownTelegramId}`,
      headers: authHeaders(unknownTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Пользователь не найден.' })
  })

  await context.test('несуществующее сообщение', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/messages/999999/file?telegram_id=${studentTelegramId}`,
      headers: authHeaders(studentTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Сообщение не найдено.' })
  })

  await context.test('сообщение без вложения', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/chats/messages/${fixtureIds.studentTextMessageId}/file?telegram_id=${studentTelegramId}`,
      headers: authHeaders(studentTelegramId),
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Вложение недоступно.' })
  })

  await context.test('CHAT_ENABLED проверяется раньше параметров и auth', async () => {
    process.env.CHAT_ENABLED = 'false'
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/chats/messages?student_id=nope',
      })
      assert.equal(response.statusCode, 503)
      assert.deepEqual(response.json(), {
        ok: false,
        error: 'Чаты временно отключены.',
      })
    } finally {
      process.env.CHAT_ENABLED = 'true'
    }
  })
})

test('POST chats/messages атомарно создаёт текст и уведомление преподавателю', async () => {
  const body = multipartMessage({
    telegram_id: studentTelegramId,
    student_id: fixtureIds.studentId,
    text_content: '  Новое сообщение ученика  ',
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/chats/messages',
    headers: { ...body.headers, ...authHeaders(studentTelegramId) },
    payload: body.payload,
  })
  assert.equal(response.statusCode, 200)
  const message = response.json().data.message
  assert.equal(message.student_id, fixtureIds.studentId)
  assert.equal(message.text_content, 'Новое сообщение ученика')
  assert.equal(message.content_type, 'text')
  assert.equal(message.sender_role_key, 'student')
  assert.equal(message.has_file, false)

  const db = new Database(databasePath, { readonly: true })
  const notification = db.prepare(`
    SELECT n.kind, n.body, n.payload
    FROM app_notifications n
    JOIN users u ON u.id = n.user_id
    WHERE u.telegram_id = ?
    ORDER BY n.id DESC LIMIT 1
  `).get(teacherTelegramId)
  db.close()
  assert.deepEqual(notification, {
    kind: 'chat_message',
    body: 'В чате ученика Анна Ученица новое сообщение.',
    payload: JSON.stringify({ student_id: fixtureIds.studentId, message_id: message.id }),
  })
})

test('POST chats/messages сохраняет нормализованное вложение и уведомляет ученика', async () => {
  const image = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'
  const body = multipartMessage(
    {
      telegram_id: teacherTelegramId,
      student_id: fixtureIds.studentId,
      text_content: 'Фото преподавателя',
    },
    { content: image, filename: '../../unsafe.svg', contentType: 'image/svg+xml' },
  )
  const response = await app.inject({
    method: 'POST',
    url: '/chats/messages',
    headers: { ...body.headers, ...authHeaders(teacherTelegramId) },
    payload: body.payload,
  })
  assert.equal(response.statusCode, 200)
  const message = response.json().data.message
  assert.equal(message.content_type, 'photo')
  assert.equal(message.has_file, true)

  const db = new Database(databasePath, { readonly: true })
  const stored = db.prepare('SELECT file_id FROM chat_messages WHERE id = ?').get(message.id) as {
    file_id: string
  }
  const notification = db.prepare(`
    SELECT n.body, n.payload
    FROM app_notifications n
    JOIN users u ON u.id = n.user_id
    WHERE u.telegram_id = ?
    ORDER BY n.id DESC LIMIT 1
  `).get(studentTelegramId)
  db.close()
  assert.equal(existsSync(stored.file_id), true)
  assert.equal(stored.file_id.endsWith('.jpg'), true)
  assert.deepEqual(notification, {
    body: 'Новое сообщение в вашем чате от преподавателя.',
    payload: JSON.stringify({ student_id: fixtureIds.studentId, message_id: message.id }),
  })
})

test('POST chats/messages исправляет SEC-002 и очищает файл при отказе', async () => {
  const uploads = join(dirname(databasePath), 'uploads')
  const beforeFiles = readdirSync(uploads).sort()
  const body = multipartMessage(
    {
      telegram_id: unassignedTeacherTelegramId,
      student_id: fixtureIds.studentId,
      text_content: 'Запрещённое сообщение',
    },
    { content: 'attachment', filename: 'denied.txt', contentType: 'text/plain' },
  )
  const response = await app.inject({
    method: 'POST',
    url: '/api/chats/messages',
    headers: { ...body.headers, ...authHeaders(unassignedTeacherTelegramId) },
    payload: body.payload,
  })
  assert.equal(response.statusCode, 403)
  assert.deepEqual(response.json(), {
    ok: false,
    error: 'Нет доступа к чату этого ученика.',
  })
  assert.deepEqual(readdirSync(uploads).sort(), beforeFiles)
})

test('POST chats/messages сохраняет validation и очищает oversized upload', async (context) => {
  await context.test('пустое сообщение', async () => {
    const body = multipartMessage({
      telegram_id: studentTelegramId,
      student_id: fixtureIds.studentId,
      text_content: '   ',
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/messages',
      headers: { ...body.headers, ...authHeaders(studentTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), { ok: false, error: 'Добавьте текст или вложение.' })
  })

  await context.test('слишком большой файл', async () => {
    const uploads = join(dirname(databasePath), 'uploads')
    const beforeFiles = readdirSync(uploads).sort()
    const body = multipartMessage(
      { telegram_id: studentTelegramId, student_id: fixtureIds.studentId },
      { content: 'x'.repeat(2_048), filename: 'large.txt', contentType: 'text/plain' },
    )
    const response = await app.inject({
      method: 'POST',
      url: '/api/chats/messages',
      headers: { ...body.headers, ...authHeaders(studentTelegramId) },
      payload: body.payload,
    })
    assert.equal(response.statusCode, 413)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Файл слишком большой. Максимум 0 МБ.',
    })
    assert.deepEqual(readdirSync(uploads).sort(), beforeFiles)
  })
})
