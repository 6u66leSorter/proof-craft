import assert from 'node:assert/strict'
import { rm } from 'node:fs/promises'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../src/app.module.js'
import { createLegacyDatabase } from './support/legacy-database.js'

let temporaryRoot: string
let app: NestFastifyApplication

const seedPortfolio = (databasePath: string): void => {
  const db = new Database(databasePath)
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
      (user_id, full_name, phone, lessons_count, status, student_track, metro, avatar_file_id)
    VALUES (?, ?, '+70000000000', ?, ?, ?, ?, ?)
  `)
  const aliceStudentId = Number(
    insertStudent.run(
      aliceUserId,
      'alice Apprentice',
      8,
      'studying',
      'intern',
      'Центральная',
      '/tmp/alice-avatar.jpg',
    ).lastInsertRowid,
  )
  const bobStudentId = Number(
    insertStudent.run(bobUserId, 'Bob Barber', 15, 'studying', 'barber', null, null).lastInsertRowid,
  )
  insertStudent.run(completedUserId, 'Aaron Completed', 15, 'completed', 'student', 'Южная', null)

  const teacherId = Number(
    db.prepare('INSERT INTO teachers (user_id, full_name) VALUES (?, ?)')
      .run(teacherUserId, 'Тестовый преподаватель').lastInsertRowid,
  )
  const insertHomework = db.prepare(`
    INSERT INTO homeworks (student_id, lesson_number, content_type, status)
    VALUES (?, ?, 'text', ?)
  `)
  const approvedHomeworkId = Number(
    insertHomework.run(aliceStudentId, 1, 'approved').lastInsertRowid,
  )
  insertHomework.run(aliceStudentId, 2, 'pending')
  insertHomework.run(aliceStudentId, 3, 'revision')
  insertHomework.run(bobStudentId, 1, 'approved')

  const insertReview = db.prepare(`
    INSERT INTO homework_reviews (homework_id, teacher_id, rating, status)
    VALUES (?, ?, ?, 'approved')
  `)
  insertReview.run(approvedHomeworkId, teacherId, 4)
  insertReview.run(approvedHomeworkId, teacherId, 5)
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
        has_avatar: false,
      },
    ],
  },
}

before(async () => {
  const fixture = await createLegacyDatabase('proof-craft-portfolio-students-')
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
