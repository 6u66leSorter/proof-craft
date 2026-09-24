import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { createTestDatabase } from './support/test-database.js'

let temporaryRoot: string
let app: NestFastifyApplication

const attachmentSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'

const seedPortfolio = (databasePath: string): void => {
  const db = new Database(databasePath)
  const uploadsDirectory = join(dirname(databasePath), 'uploads')
  mkdirSync(uploadsDirectory, { recursive: true })
  const approvedFile = join(uploadsDirectory, 'approved-work.txt')
  const pendingFile = join(uploadsDirectory, 'pending-work.txt')
  const localAttachment = join(uploadsDirectory, 'approved-attachment.svg')
  const avatarFile = join(uploadsDirectory, 'alice-avatar.jpg')
  const missingAvatarFile = join(uploadsDirectory, 'missing-avatar.jpg')
  writeFileSync(approvedFile, 'approved')
  writeFileSync(pendingFile, 'pending')
  writeFileSync(localAttachment, attachmentSvg)
  writeFileSync(avatarFile, 'avatar-content')

  const insertUser = db.prepare(`
    INSERT INTO users (telegram_id, first_name, role)
    VALUES (?, ?, 'student')
  `)
  const aliceUserId = Number(insertUser.run(5101, 'Alice').lastInsertRowid)
  const bobUserId = Number(insertUser.run(5102, 'Bob').lastInsertRowid)
  const completedUserId = Number(insertUser.run(5103, 'Completed').lastInsertRowid)
  const teacherUserId = Number(insertUser.run(5201, 'Teacher').lastInsertRowid)

  const insertStudent = db.prepare(`
    INSERT INTO students
      (user_id, full_name, phone, lessons_count, status, student_track, metro, about_me, avatar_file_id)
    VALUES (?, ?, '+70000000000', ?, ?, ?, ?, ?, ?)
  `)
  const aliceStudentId = Number(
    insertStudent.run(
      aliceUserId,
      'alice Apprentice',
      8,
      'studying',
      'intern',
      'Центральная',
      'Публичное описание',
      avatarFile,
    ).lastInsertRowid,
  )
  const bobStudentId = Number(
    insertStudent.run(bobUserId, 'Bob Barber', 15, 'studying', 'barber', null, null, missingAvatarFile).lastInsertRowid,
  )
  insertStudent.run(completedUserId, 'Aaron Completed', 15, 'completed', 'student', 'Южная', null, null)

  const teacherId = Number(
    db.prepare('INSERT INTO teachers (user_id, full_name) VALUES (?, ?)')
      .run(teacherUserId, 'Тестовый преподаватель').lastInsertRowid,
  )
  db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
    .run(aliceStudentId, teacherId)
  const insertHomework = db.prepare(`
    INSERT INTO homeworks
      (student_id, lesson_number, is_bonus, content_type, file_id, text_content, status, haircut_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const approvedHomeworkId = Number(
    insertHomework.run(
      aliceStudentId,
      1,
      0,
      'document',
      approvedFile,
      'Публичная работа',
      'approved',
      'Фейд',
      '2026-01-01 12:00:00',
    ).lastInsertRowid,
  )
  const pendingHomeworkId = Number(
    insertHomework.run(
      aliceStudentId,
      2,
      0,
      'document',
      pendingFile,
      'Скрытая работа',
      'pending',
      'Кроп',
      '2026-02-01 12:00:00',
    ).lastInsertRowid,
  )
  insertHomework.run(aliceStudentId, 3, 0, 'text', null, 'Доработка', 'revision', null, '2026-03-01 12:00:00')
  insertHomework.run(bobStudentId, 1, 1, 'text', null, 'Бонус', 'approved', null, '2026-01-02 12:00:00')

  const insertReview = db.prepare(`
    INSERT INTO homework_reviews (homework_id, teacher_id, rating, comment, status, created_at)
    VALUES (?, ?, ?, ?, 'approved', ?)
  `)
  insertReview.run(approvedHomeworkId, teacherId, 4, 'Первая проверка', '2026-01-01 13:00:00')
  insertReview.run(approvedHomeworkId, teacherId, 5, 'Отличная работа', '2026-01-01 14:00:00')
  db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(approvedHomeworkId, localAttachment, 'photo', 0)
  db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(approvedHomeworkId, 'telegram-file-id-12345', 'photo', 1)
  db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order)
    VALUES (?, ?, ?, ?)
  `).run(pendingHomeworkId, pendingFile, 'document', 0)
  db.close()
}

const expectedResponse = {
  ok: true,
  data: {
    students: [
      {
        id: 1,
        full_name: 'alice Apprentice',
        lessons_count: 8,
        student_track: 'intern',
        metro: 'Центральная',
        average_rating: 4.5,
        works_count: 1,
        has_avatar: true,
      },
      {
        id: 2,
        full_name: 'Bob Barber',
        lessons_count: 15,
        student_track: 'barber',
        metro: null,
        average_rating: null,
        works_count: 1,
        has_avatar: true,
      },
    ],
  },
}

const expectedStudentPortfolio = {
  ok: true,
  data: {
    student: {
      id: 1,
      full_name: 'alice Apprentice',
      lessons_count: 8,
      student_track: 'intern',
      metro: 'Центральная',
      about_me: 'Публичное описание',
      average_rating: 4.5,
      ratings_count: 2,
      has_avatar: true,
      teachers: [{ id: 1, full_name: 'Тестовый преподаватель' }],
    },
    homeworks: [
      {
        id: 1,
        lesson_number: 1,
        is_bonus: false,
        haircut_name: 'Фейд',
        status: 'approved',
        content_type: 'document',
        text_content: 'Публичная работа',
        created_at: '2026-01-01 12:00:00',
        rating: 5,
        review_comment: 'Отличная работа',
        reviewer_name: 'Тестовый преподаватель',
        has_local_file: true,
        has_telegram_file: false,
        extra_files_count: 2,
        attachments: [
          {
            id: 1,
            content_type: 'photo',
            has_local_file: true,
            has_telegram_file: false,
          },
          {
            id: 2,
            content_type: 'photo',
            has_local_file: false,
            has_telegram_file: true,
          },
        ],
      },
    ],
  },
}

before(async () => {
  const fixture = await createTestDatabase('proof-craft-portfolio-students-')
  temporaryRoot = fixture.temporaryRoot
  seedPortfolio(fixture.databasePath)
  process.env.DATABASE_URL = `file:${fixture.databasePath}`

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
})

after(async () => {
  await app?.close()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('GET /api/guest/portfolio-students возвращает только studying-профили', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/guest/portfolio-students' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedResponse)
})

test('works_count публичной витрины учитывает только approved-работы', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/guest/portfolio-students' })
  const body = response.json() as typeof expectedResponse
  assert.equal(body.data.students[0]?.works_count, 1)
})

test('GET /guest/portfolio-students поддерживает nginx без префикса /api', async () => {
  const response = await app.inject({ method: 'GET', url: '/guest/portfolio-students' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedResponse)
})

test('GET /api/guest/students/:id/portfolio возвращает только approved-работы', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/guest/students/1/portfolio' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedStudentPortfolio)
})

test('публичный профиль сохраняет 400/404 legacy-контракт', async (context) => {
  await context.test('некорректный student_id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest/students/nope/portfolio' })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })

  await context.test('несуществующий профиль', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest/students/999/portfolio' })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Профиль недоступен.' })
  })

  await context.test('completed-профиль', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest/students/3/portfolio' })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Профиль недоступен.' })
  })
})

test('GET /guest/students/:id/portfolio поддерживает nginx без /api', async () => {
  const response = await app.inject({ method: 'GET', url: '/guest/students/1/portfolio' })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.json(), expectedStudentPortfolio)
})

test('GET /api/guest/students/:id/avatar отдаёт публичный JPEG с cache headers', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/guest/students/1/avatar' })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'image/jpeg')
  assert.equal(response.headers['cache-control'], 'public, max-age=3600')
  assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
  assert.equal(response.body, 'avatar-content')
})

test('публичный аватар различает недоступный профиль и отсутствующий файл', async (context) => {
  await context.test('некорректный student_id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest/students/nope/avatar' })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })

  await context.test('completed-профиль', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest/students/3/avatar' })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Профиль недоступен.' })
  })

  await context.test('ссылка на отсутствующий файл', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest/students/2/avatar' })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Файл аватара не найден.' })
  })
})

test('GET /guest/students/:id/avatar поддерживает nginx без /api', async () => {
  const response = await app.inject({ method: 'GET', url: '/guest/students/1/avatar' })
  assert.equal(response.statusCode, 200)
  assert.equal(response.body, 'avatar-content')
})

test('GET /api/guest/homeworks/:id/file отдаёт файл approved-работы', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/guest/homeworks/1/file' })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/octet-stream')
  assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
  assert.equal(response.body, 'approved')
})

test('GET публичного фото с preview возвращает JPEG', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/guest/homeworks/1/attachments/1/file?preview=1',
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'image/jpeg')
  assert.deepEqual([...response.rawPayload.subarray(0, 2)], [0xff, 0xd8])
})

test('публичная файловая ручка не отдаёт pending-работу', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/guest/homeworks/2/file' })
  assert.equal(response.statusCode, 404)
  assert.deepEqual(response.json(), { ok: false, error: 'Работа не найдена.' })
})

test('GET /api/guest/homeworks/:id/attachments/:id/file отдаёт approved-вложение', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/api/guest/homeworks/1/attachments/1/file',
  })
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'image/jpeg')
  assert.equal(response.headers['cross-origin-resource-policy'], 'cross-origin')
  assert.equal(response.body, attachmentSvg)
})

test('публичное вложение проверяет работу, статус и профиль', async (context) => {
  await context.test('pending-работа недоступна', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/guest/homeworks/2/attachments/3/file',
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Работа не найдена.' })
  })

  await context.test('вложение должно принадлежать работе из URL', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/guest/homeworks/4/attachments/1/file',
    })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.json(), { ok: false, error: 'Вложение не найдено.' })
  })
})

test('публичные файлы сохраняют 400-контракт и nginx-путь', async (context) => {
  await context.test('некорректный id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/guest/homeworks/nope/file' })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })

  await context.test('некорректный preview', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/guest/homeworks/1/file?preview=0',
    })
    assert.equal(response.statusCode, 400)
    assert.deepEqual(response.json(), {
      ok: false,
      error: 'Некорректные параметры запроса.',
    })
  })

  await context.test('nginx без /api', async () => {
    const response = await app.inject({ method: 'GET', url: '/guest/homeworks/1/file' })
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, 'approved')
  })
})
