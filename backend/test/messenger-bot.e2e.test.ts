import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test, { after, before } from 'node:test'
import Database from 'better-sqlite3'
import type { INestApplicationContext } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FeedbackInvitesWorker } from '../src/messenger/feedback-invites.worker.js'
import { MessengerModule } from '../src/messenger/messenger.module.js'
import { TelegramAdapter } from '../src/messenger/telegram/telegram.adapter.js'
import { FakeTelegram } from './support/fake-telegram.js'
import { createTestDatabase } from './support/test-database.js'

const botToken = '123456:nest-bot-token'
const people = {
  admin: { id: 9601, first_name: 'Admin', username: 'boss' },
  teacher: { id: 9602, first_name: 'Ирина', last_name: 'Соколова', username: 'irina' },
  otherTeacher: { id: 9603, first_name: 'Дмитрий', username: 'dima' },
  student: { id: 9604, first_name: 'Анна', username: 'anna' },
  applicant: { id: 9605, first_name: 'Ольга' },
  newcomer: { id: 9606, first_name: 'Никита', last_name: 'Новиков', username: 'nikita' },
  stranger: { id: 9607, first_name: 'Гость' },
}

let temporaryRoot: string
let databasePath: string
let context: INestApplicationContext
const telegram = new FakeTelegram()
const ids = { teacherId: 0, otherTeacherId: 0, studentId: 0, applicantId: 0, photoHomeworkId: 0, textHomeworkId: 0 }

const withDb = <T>(fn: (db: Database.Database) => T): T => {
  const db = new Database(databasePath)
  try {
    return fn(db)
  } finally {
    db.close()
  }
}
const mark = () => telegram.calls.length
const buttonsOf = (call: { body: Record<string, unknown> }) =>
  ((call.body.reply_markup as { inline_keyboard?: Array<Array<{ text: string; callback_data?: string }>> } | undefined)?.inline_keyboard ?? []).flat()

before(async () => {
  const fixture = await createTestDatabase('proof-craft-bot-')
  temporaryRoot = fixture.temporaryRoot
  databasePath = fixture.databasePath
  const uploads = join(dirname(databasePath), 'uploads')
  mkdirSync(uploads, { recursive: true })
  const photoPath = join(uploads, 'bot-photo.jpg')
  writeFileSync(photoPath, 'jpeg-bytes')
  withDb((db) => {
    const insertUser = db.prepare('INSERT INTO users (telegram_id, username, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)')
    const addRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)')
    const user = (p: { id: number; username?: string; first_name: string; last_name?: string }, role: string) => {
      const id = Number(insertUser.run(p.id, p.username ?? null, p.first_name, p.last_name ?? null, role).lastInsertRowid)
      addRole.run(id, role)
      return id
    }
    const admin = user(people.admin, 'admin')
    void admin
    const teacher = user(people.teacher, 'teacher')
    const otherTeacher = user(people.otherTeacher, 'teacher')
    const student = user(people.student, 'student')
    const applicant = user(people.applicant, 'student')
    user(people.newcomer, 'guest')
    const insertTeacher = db.prepare('INSERT INTO teachers (user_id, full_name) VALUES (?, ?)')
    ids.teacherId = Number(insertTeacher.run(teacher, 'Ирина Соколова').lastInsertRowid)
    ids.otherTeacherId = Number(insertTeacher.run(otherTeacher, 'Дмитрий Орлов').lastInsertRowid)
    const insertStudent = db.prepare(`INSERT INTO students (user_id, full_name, phone, lessons_count, status) VALUES (?, ?, ?, 10, ?)`)
    ids.studentId = Number(insertStudent.run(student, 'Анна Смирнова', '+79990000001', 'studying').lastInsertRowid)
    ids.applicantId = Number(insertStudent.run(applicant, 'Ольга Петрова', '+79990000004', 'moderation').lastInsertRowid)
    db.prepare('INSERT INTO student_teachers (student_id, teacher_id) VALUES (?, ?)').run(ids.studentId, ids.teacherId)
    const insertHomework = db.prepare(`INSERT INTO homeworks (student_id, lesson_number, is_bonus, content_type, file_id, text_content, status) VALUES (?, ?, 0, ?, ?, ?, 'pending')`)
    ids.photoHomeworkId = Number(insertHomework.run(ids.studentId, 4, 'photo', photoPath, 'Оформление бороды.').lastInsertRowid)
    ids.textHomeworkId = Number(insertHomework.run(ids.studentId, 5, 'text', null, 'Разбор техники.').lastInsertRowid)
  })

  process.env.DATABASE_URL = `file:${databasePath}`
  process.env.BOT_TOKEN = botToken
  process.env.TELEGRAM_API_BASE_URL = await telegram.start()
  process.env.TELEGRAM_POLL_TIMEOUT_SEC = '0'
  context = await NestFactory.createApplicationContext(MessengerModule, { logger: false })
  context.enableShutdownHooks()
  context.get(TelegramAdapter).start(botToken)
})

after(async () => {
  await context?.close()
  await telegram.stop()
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true })
})

test('/start приветствует и создаёт guest-пользователя', async () => {
  const since = mark()
  await telegram.message(people.stranger, '/start')
  assert.deepEqual(telegram.texts(since), ['Привет! Чтобы войти в приложение, нажми на кнопку «Дневник» в левом нижнем углу.'])
  const user = withDb((db) => db.prepare(`SELECT u.role, (SELECT group_concat(role) FROM user_roles WHERE user_id = u.id) AS roles FROM users u WHERE telegram_id = ?`).get(people.stranger.id))
  assert.deepEqual(user, { role: 'guest', roles: 'guest' })
})

test('/start webauth_<token> подтверждает вход на сайт один раз', async () => {
  const token = crypto.randomBytes(32).toString('base64url')
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  withDb((db) => db.prepare(`INSERT INTO web_login_requests (provider, token_hash, expires_at) VALUES ('telegram', ?, datetime('now', '+15 minutes'))`).run(hash))
  let since = mark()
  await telegram.message(people.student, `/start webauth_${token}`)
  assert.deepEqual(telegram.texts(since), ['Вход подтверждён. Вернитесь в браузер — дневник откроется автоматически.'])
  const approvedBy = withDb((db) => db.prepare(`SELECT u.telegram_id FROM web_login_requests r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?`).get(hash))
  assert.deepEqual(approvedBy, { telegram_id: people.student.id })
  since = mark()
  await telegram.message(people.student, `/start webauth_${token}`)
  assert.deepEqual(telegram.texts(since), ['Ссылка для входа истекла или уже была использована. Вернитесь на сайт и начните вход заново.'])
})

test('/admin доступна только администратору', async () => {
  let since = mark()
  await telegram.message(people.student, '/admin')
  assert.deepEqual(telegram.texts(since), ['У вас нет доступа к админ-панели.'])
  since = mark()
  await telegram.message(people.admin, '/admin')
  const [menu] = telegram.after(since)
  assert.equal(menu?.body.text, '🔐 Админ-панель')
  assert.deepEqual(buttonsOf(menu!).map((b) => b.callback_data), ['admin_moderation', 'admin_active', 'admin_teachers'])
})

test('модерация: заявка одобряется через общий use case с аудитом и уведомлением ученику', async () => {
  let since = mark()
  await telegram.press(people.admin, 'admin_moderation')
  const card = telegram.after(since).find((c) => c.method === 'sendMessage')!
  assert.equal(card.body.text, 'Новый ученик: Ольга Петрова\nТелефон: +79990000004\nКоличество занятий: 10')
  assert.deepEqual(buttonsOf(card).map((b) => b.callback_data), [`admin_approve_${ids.applicantId}`, `admin_reject_${ids.applicantId}`])
  since = mark()
  await telegram.press(people.stranger, `admin_approve_${ids.applicantId}`)
  assert.deepEqual(telegram.texts(since, people.stranger.id), ['Доступ только для администраторов.'])
  since = mark()
  await telegram.press(people.admin, `admin_approve_${ids.applicantId}`)
  assert.deepEqual(telegram.texts(since, people.admin.id), ['✅ Ученик Ольга Петрова одобрен и активирован.'])
  assert.deepEqual(telegram.texts(since, people.applicant.id), ['🎉 Ваша заявка одобрена! Теперь вы можете сдавать домашние задания.'])
  const state = withDb((db) => ({
    status: (db.prepare('SELECT status FROM students WHERE id = ?').get(ids.applicantId) as { status: string }).status,
    audit: (db.prepare('SELECT action FROM audit_log ORDER BY id DESC LIMIT 1').get() as { action: string }).action,
  }))
  assert.deepEqual(state, { status: 'studying', audit: 'admin_student_approve' })
})

test('роль преподавателя назначается и снимается по Telegram ID без удаления профиля (SEC-003)', async () => {
  let since = mark()
  await telegram.press(people.admin, 'admin_teachers_assign_id')
  await telegram.message(people.admin, 'не число')
  await telegram.message(people.admin, String(people.newcomer.id))
  assert.deepEqual(telegram.texts(since, people.admin.id), [
    'Отправьте Telegram ID пользователя, которого нужно назначить преподавателем.',
    'Не удалось распознать Telegram ID. Отправьте числовой ID.',
    `✅ Пользователь ${people.newcomer.id} назначен преподавателем.`,
  ])
  const teacherName = withDb((db) => db.prepare(`SELECT t.full_name FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.telegram_id = ?`).get(people.newcomer.id))
  assert.deepEqual(teacherName, { full_name: 'Никита Новиков' })

  since = mark()
  await telegram.press(people.admin, 'admin_teachers_remove_id')
  await telegram.message(people.admin, String(people.otherTeacher.id))
  assert.deepEqual(telegram.texts(since, people.admin.id), [
    'Отправьте Telegram ID преподавателя, которого нужно удалить.',
    `✅ Преподаватель ${people.otherTeacher.id} удалён.`,
  ])
  const removed = withDb((db) => db.prepare(`
    SELECT (SELECT COUNT(*) FROM user_roles r JOIN users u ON u.id = r.user_id WHERE u.telegram_id = ? AND r.role = 'teacher') AS roles,
           (SELECT COUNT(*) FROM teachers WHERE id = ?) AS profiles
  `).get(people.otherTeacher.id, ids.otherTeacherId))
  assert.deepEqual(removed, { roles: 0, profiles: 1 })

  since = mark()
  await telegram.press(people.admin, 'admin_teachers_assign_id')
  await telegram.message(people.admin, '424242')
  assert.deepEqual(telegram.texts(since, people.admin.id).at(-1), 'Пользователь не найден. Попросите его отправить /start боту.')
})

test('ученик назначается преподавателю через меню', async () => {
  let since = mark()
  await telegram.press(people.admin, 'admin_assign_teacher')
  const teachersMenu = telegram.after(since).find((c) => c.method === 'sendMessage')!
  assert.equal(teachersMenu.body.text, 'Выберите преподавателя:')
  const newTeacherId = withDb((db) => (db.prepare(`SELECT t.id FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.telegram_id = ?`).get(people.newcomer.id) as { id: number }).id)
  assert.ok(buttonsOf(teachersMenu).some((b) => b.callback_data === `admin_assign_teacher_${newTeacherId}`))
  since = mark()
  await telegram.press(people.admin, `admin_assign_teacher_${newTeacherId}`)
  const studentsMenu = telegram.after(since).find((c) => c.method === 'sendMessage')!
  assert.equal(studentsMenu.body.text, `Выберите ученика для преподавателя Никита Новиков (@nikita · id ${newTeacherId}):`)
  since = mark()
  await telegram.press(people.admin, `admin_assign_student_${newTeacherId}_${ids.studentId}`)
  assert.deepEqual(telegram.texts(since, people.admin.id), ['✅ Ученик назначен преподавателю.'])
  const answer = telegram.after(since).find((c) => c.method === 'answerCallbackQuery')!
  assert.equal(answer.body.text, 'Ученик назначен преподавателю.')
  const assigned = withDb((db) => db.prepare('SELECT COUNT(*) AS count FROM student_teachers WHERE student_id = ? AND teacher_id = ?').get(ids.studentId, newTeacherId))
  assert.deepEqual(assigned, { count: 1 })
})

test('/teacher показывает работы на проверке с фото и принимает работу через диалог', async () => {
  let since = mark()
  await telegram.message(people.teacher, '/teacher')
  const [list] = telegram.after(since)
  assert.equal(list?.body.text, '📝 Проверить задания:\n\nАнна Смирнова (2 непроверенных)\n')
  assert.deepEqual(buttonsOf(list!).map((b) => b.callback_data), [`teacher_student_${ids.studentId}`])

  since = mark()
  await telegram.press(people.teacher, `teacher_student_${ids.studentId}`)
  const shown = telegram.after(since).filter((c) => c.method !== 'answerCallbackQuery')
  const photo = shown.find((c) => c.method === 'sendPhoto')!
  assert.equal(photo.body.caption, '📝 Урок №4\nТекст: Оформление бороды.\nФайл: photo\n')
  assert.deepEqual(photo.body.photo, { uploadedFile: 'bot-photo.jpg', size: 10 })
  const text = shown.find((c) => c.method === 'sendMessage')!
  assert.equal(text.body.text, '📝 Урок №5\nТекст: Разбор техники.\n')

  since = mark()
  await telegram.press(people.teacher, `review_approve_${ids.photoHomeworkId}`)
  await telegram.message(people.teacher, '7')
  await telegram.message(people.teacher, '5')
  await telegram.message(people.teacher, 'Отличная работа')
  assert.deepEqual(telegram.texts(since, people.teacher.id), [
    '⭐ Введите оценку от 1 до 5:',
    'Оценка должна быть от 1 до 5. Попробуйте ещё раз.',
    '✏️ Введите комментарий (или отправьте "-" чтобы пропустить):',
    '✅ Проверка сохранена.',
  ])
  assert.deepEqual(telegram.texts(since, people.student.id), ['✅ Твое задание по урок №4 проверено.\nОценка: ⭐⭐⭐⭐⭐\nКомментарий: Отличная работа'])
  const review = withDb((db) => db.prepare('SELECT h.status, r.rating, r.comment FROM homeworks h JOIN homework_reviews r ON r.homework_id = h.id WHERE h.id = ?').get(ids.photoHomeworkId))
  assert.deepEqual(review, { status: 'approved', rating: 5, comment: 'Отличная работа' })

  since = mark()
  await telegram.press(people.teacher, `review_comment_${ids.photoHomeworkId}`)
  await telegram.message(people.teacher, 'Ещё раз')
  assert.equal(telegram.texts(since, people.teacher.id).at(-1), 'Это задание уже проверено.')
})

test('преподаватель без назначения не может проверить чужую работу', async () => {
  withDb((db) => db.prepare('DELETE FROM student_teachers WHERE teacher_id = (SELECT t.id FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.telegram_id = ?)').run(people.newcomer.id))
  const since = mark()
  await telegram.press(people.newcomer, `review_comment_${ids.textHomeworkId}`)
  await telegram.message(people.newcomer, 'Переделать')
  assert.equal(telegram.texts(since, people.newcomer.id).at(-1), 'Ученик не прикреплён к этому преподавателю.')
  const status = withDb((db) => db.prepare('SELECT status FROM homeworks WHERE id = ?').get(ids.textHomeworkId))
  assert.deepEqual(status, { status: 'pending' })
})

test('приглашения к отзыву уходят один раз с кнопкой на форму, синтетические VK-аккаунты пропускаются', async () => {
  const worker = context.get(FeedbackInvitesWorker)
  assert.equal(worker.feedbackUrl('http://academy.local'), null)
  const url = worker.feedbackUrl('https://academy.example/app')!
  assert.equal(url, 'https://academy.example/app?feedback=1')
  const vkStudentId = withDb((db) => {
    const userId = Number(db.prepare(`INSERT INTO users (telegram_id, role, vk_user_id) VALUES (10000007001, 'student', 7001)`).run().lastInsertRowid)
    const studentId = Number(db.prepare(`INSERT INTO students (user_id, full_name, phone, lessons_count, status) VALUES (?, 'VK Ученица', '+7', 10, 'studying')`).run(userId).lastInsertRowid)
    db.prepare(`INSERT INTO feedback_invites (student_id, milestone) VALUES (?, 5), (?, 10)`).run(ids.studentId, studentId)
    return studentId
  })
  const since = mark()
  await worker.runOnce(context.get(TelegramAdapter), url)
  const sent = telegram.after(since)
  assert.equal(sent.length, 1)
  assert.equal(sent[0]?.body.chat_id, people.student.id)
  assert.equal(
    sent[0]?.body.text,
    'Урок №5 принят! Поделитесь впечатлениями о преподавателе и академии. Сообщение увидит только администратор вместе с вашим именем. Преподаватель не получит отзыв или уведомление о нём.',
  )
  assert.deepEqual((sent[0]?.body.reply_markup as { inline_keyboard: unknown }).inline_keyboard, [[{ text: 'Оставить отзыв', url }]])
  const statuses = withDb((db) => db.prepare('SELECT student_id, delivery_status FROM feedback_invites ORDER BY id').all())
  assert.deepEqual(statuses, [
    { student_id: ids.studentId, delivery_status: 'sent' },
    { student_id: vkStudentId, delivery_status: 'pending' },
  ])
  const again = mark()
  await worker.runOnce(context.get(TelegramAdapter), url)
  assert.equal(telegram.after(again).length, 0)
})
