import crypto from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import sharp from 'sharp'
import { VISUAL_SESSIONS } from './sessions.mjs'


/**
 * Даты лежат в 2030 году: legacy API удаляет уведомления старше срока хранения,
 * а будущие записи не устаревают, поэтому снимки не меняются со временем.
 */
const at = (day, time = '12:00:00') => `2030-03-${String(day).padStart(2, '0')} ${time}`

const pictureSvg = (hue, label) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},45%,32%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,62%)"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" fill="url(#g)"/>
  <circle cx="600" cy="400" r="210" fill="hsl(${hue},30%,88%)" opacity=".85"/>
  <rect x="330" y="640" width="540" height="90" rx="45" fill="hsl(${hue},25%,18%)" opacity=".7"/>
  <text x="600" y="420" text-anchor="middle" font-size="120" font-family="sans-serif" fill="hsl(${hue},40%,25%)">${label}</text>
</svg>`

const writePicture = async (dir, name, hue, label) => {
  const path = join(dir, name)
  await sharp(Buffer.from(pictureSvg(hue, label))).jpeg({ quality: 85 }).toFile(path)
  return path
}

const sessionHash = (token) => crypto.createHash('sha256').update(token).digest('hex')

export async function seedVisualDatabase(databasePath) {
  const uploads = join(dirname(databasePath), 'uploads')
  mkdirSync(uploads, { recursive: true })

  const files = {
    annaAvatar: await writePicture(uploads, 'anna-avatar.jpg', 24, 'А'),
    maxAvatar: await writePicture(uploads, 'max-avatar.jpg', 210, 'М'),
    egorAvatar: await writePicture(uploads, 'egor-avatar.jpg', 130, 'Е'),
    fade: await writePicture(uploads, 'hw-fade.jpg', 35, '1'),
    fadeSide: await writePicture(uploads, 'hw-fade-side.jpg', 55, '1b'),
    fadeBack: await writePicture(uploads, 'hw-fade-back.jpg', 75, '1c'),
    crop: await writePicture(uploads, 'hw-crop.jpg', 190, '2'),
    beard: await writePicture(uploads, 'hw-beard.jpg', 280, '4'),
    revision: await writePicture(uploads, 'hw-revision.jpg', 330, '3'),
    maxFade: await writePicture(uploads, 'hw-max-fade.jpg', 160, 'M1'),
    maxPending: await writePicture(uploads, 'hw-max-pending.jpg', 250, 'M2'),
    egorWork: await writePicture(uploads, 'hw-egor.jpg', 100, 'E1'),
    chatPhoto: await writePicture(uploads, 'chat-photo.jpg', 15, 'Ч'),
  }

  const db = new Database(databasePath)
  db.pragma('foreign_keys = ON')

  const run = db.transaction(() => {
    const insertUser = db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, last_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const user = (telegramId, username, first, last, role) =>
      Number(insertUser.run(telegramId, username, first, last, role, at(1), at(1)).lastInsertRowid)
    const addRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role, created_at) VALUES (?, ?, ?)')

    const admin = user(1001, 'visual_admin', 'Виктория', 'Админова', 'admin')
    const teacherIrina = user(2001, 'visual_irina', 'Ирина', 'Соколова', 'teacher')
    const teacherDmitry = user(2002, 'visual_dmitry', 'Дмитрий', 'Орлов', 'teacher')
    const anna = user(3001, 'visual_anna', 'Анна', 'Смирнова', 'student')
    const max = user(3002, 'visual_max', 'Максим', 'Волков', 'student')
    const egor = user(3003, 'visual_egor', 'Егор', 'Кузнецов', 'student')
    const olga = user(3004, 'visual_olga', 'Ольга', 'Петрова', 'student')
    const newcomer = user(4001, 'visual_newcomer', 'Никита', 'Новиков', 'guest')
    const applicant = user(4002, 'visual_applicant', 'Олег', 'Кандидатов', 'guest')
    addRole.run(admin, 'admin', at(1))
    addRole.run(teacherIrina, 'teacher', at(1))
    addRole.run(teacherDmitry, 'teacher', at(1))
    for (const id of [anna, max, egor, olga]) addRole.run(id, 'student', at(1))
    addRole.run(newcomer, 'guest', at(1))
    addRole.run(applicant, 'guest', at(1))

    const insertTeacher = db.prepare(`
      INSERT INTO teachers (user_id, full_name, about_me, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `)
    const irinaId = Number(insertTeacher.run(
      teacherIrina, 'Ирина Соколова',
      'Барбер с восьмилетним стажем. Веду курс мужских стрижек и работы с машинкой.', at(1), at(1),
    ).lastInsertRowid)
    insertTeacher.run(teacherDmitry, 'Дмитрий Орлов', null, at(1), at(1))

    const insertStudent = db.prepare(`
      INSERT INTO students
        (user_id, full_name, phone, lessons_count, status, metro, student_track, about_me, avatar_file_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const student = (userId, name, phone, lessons, status, metro, track, about, avatar) =>
      Number(insertStudent.run(userId, name, phone, lessons, status, metro, track, about, avatar, at(2), at(2)).lastInsertRowid)
    const annaId = student(anna, 'Анна Смирнова', '+79990000001', 15, 'studying', 'Чистые пруды', 'student',
      'Учусь мужским стрижкам, люблю аккуратные фейды и классику.', files.annaAvatar)
    const maxId = student(max, 'Максим Волков', '+79990000002', 10, 'studying', 'Сокол', 'intern', null, files.maxAvatar)
    const egorId = student(egor, 'Егор Кузнецов', '+79990000003', 20, 'completed', 'Арбатская', 'barber',
      'Закончил курс, работаю в барбершопе.', files.egorAvatar)
    student(olga, 'Ольга Петрова', '+79990000004', 10, 'moderation', 'Таганская', 'student', null, null)

    const assign = db.prepare('INSERT INTO student_teachers (student_id, teacher_id, created_at) VALUES (?, ?, ?)')
    assign.run(annaId, irinaId, at(3))
    assign.run(maxId, irinaId, at(3))

    const insertHomework = db.prepare(`
      INSERT INTO homeworks
        (student_id, lesson_number, is_bonus, content_type, file_id, text_content, status, haircut_name,
         revision_student_text, revision_student_file_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const homework = (studentId, lesson, bonus, type, file, text, status, haircut, day, revisionText = null, revisionFile = null) =>
      Number(insertHomework.run(studentId, lesson, bonus, type, file, text, status, haircut, revisionText, revisionFile, at(day), at(day)).lastInsertRowid)

    const annaFade = homework(annaId, 1, 0, 'photo', files.fade, 'Классический фейд с плавным переходом.', 'approved', 'Фейд', 5)
    const annaCrop = homework(annaId, 2, 0, 'photo', files.crop, 'Кроп с текстурой на макушке.', 'approved', 'Кроп', 7)
    const annaRevision = homework(annaId, 3, 0, 'photo', files.revision, 'Андеркат, первая попытка.', 'revision', 'Андеркат', 9,
      'Поправила окантовку и переход на висках.', files.revision)
    const annaPending = homework(annaId, 4, 0, 'photo', files.beard, 'Оформление бороды.', 'pending', 'Борода', 11)
    homework(annaId, null, 1, 'text', null, 'Разбор техники работы ножницами по расчёске.', 'pending', 'Бонус: техника', 12)
    const maxFade = homework(maxId, 1, 0, 'photo', files.maxFade, 'Первый фейд.', 'approved', 'Фейд', 6)
    homework(maxId, 2, 0, 'photo', files.maxPending, 'Кроп на модели.', 'pending', 'Кроп', 12)
    const egorWork = homework(egorId, 1, 0, 'photo', files.egorWork, 'Дипломная работа.', 'approved', 'Помпадур', 4)

    const attach = db.prepare(`
      INSERT INTO homework_files (homework_id, file_id, content_type, sort_order, created_at) VALUES (?, ?, 'photo', ?, ?)
    `)
    attach.run(annaFade, files.fadeSide, 0, at(5, '12:10:00'))
    attach.run(annaFade, files.fadeBack, 1, at(5, '12:20:00'))

    const review = db.prepare(`
      INSERT INTO homework_reviews (homework_id, teacher_id, rating, comment, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    review.run(annaFade, irinaId, 5, 'Отличный переход, аккуратная окантовка.', 'approved', at(6), at(6))
    review.run(annaCrop, irinaId, 4, 'Хорошо, но текстуру можно сделать мягче.', 'approved', at(8), at(8))
    review.run(annaRevision, irinaId, null, 'Переход на висках рваный, поправьте окантовку.', 'rejected', at(10), at(10))
    review.run(maxFade, irinaId, 4, 'Неплохо для первой работы.', 'approved', at(7), at(7))
    review.run(egorWork, irinaId, 5, 'Готовая работа уровня барбера.', 'approved', at(5), at(5))

    const comment = db.prepare(`
      INSERT INTO homework_comments (homework_id, author_user_id, text_content, created_at) VALUES (?, ?, ?, ?)
    `)
    comment.run(annaFade, anna, 'Спасибо! Какой машинкой лучше делать переход?', at(6, '14:00:00'))
    comment.run(annaFade, teacherIrina, 'Попробуйте с насадкой 1,5 и открытым ножом.', at(6, '15:00:00'))

    const notify = db.prepare(`
      INSERT INTO app_notifications (user_id, kind, body, payload, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `)
    notify.run(anna, 'homework_reviewed', 'Преподаватель проверил урок 2: оценка 4',
      JSON.stringify({ homework_id: annaCrop, student_id: annaId }), null, at(8))
    notify.run(anna, 'homework_revision', 'Урок 3 отправлен на доработку',
      JSON.stringify({ homework_id: annaRevision, student_id: annaId }), null, at(10))
    notify.run(anna, 'homework_reviewed', 'Преподаватель проверил урок 1: оценка 5',
      JSON.stringify({ homework_id: annaFade, student_id: annaId }), at(6, '18:00:00'), at(6))
    notify.run(teacherIrina, 'homework_submitted', 'Анна Смирнова отправила урок 4',
      JSON.stringify({ homework_id: annaPending, student_id: annaId }), null, at(11))
    notify.run(admin, 'student_registered', 'Новая заявка: Ольга Петрова', null, null, at(12))

    const chat = db.prepare(`
      INSERT INTO chat_messages (student_id, sender_user_id, text_content, content_type, file_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    chat.run(annaId, anna, 'Здравствуйте! Можно уточнить задание к уроку 3?', 'text', null, at(9, '10:00:00'))
    chat.run(annaId, teacherIrina, 'Да, нужен андеркат с резким переходом.', 'text', null, at(9, '10:15:00'))
    chat.run(annaId, anna, 'Вот пример, который я нашла.', 'photo', files.chatPhoto, at(9, '10:20:00'))
    chat.run(annaId, teacherIrina, 'Отличный референс, ориентируйтесь на него.', 'text', null, at(9, '10:30:00'))

    db.prepare(`
      INSERT INTO teacher_applications (applicant_user_id, full_name, phone, status, created_at, updated_at)
      VALUES (?, 'Олег Кандидатов', '+79995550002', 'pending', ?, ?)
    `).run(applicant, at(12), at(12))

    db.prepare(`
      INSERT INTO student_profile_edits (student_id, new_full_name, new_phone, new_metro, status, created_at)
      VALUES (?, 'Максим Волков-Андреев', '+79990000022', 'Динамо', 'pending', ?)
    `).run(maxId, at(12))

    const feedback = db.prepare(`
      INSERT INTO private_feedback (student_id, request_key, subject, message, created_at) VALUES (?, ?, ?, ?, ?)
    `)
    feedback.run(annaId, '00000000-0000-4000-8000-000000000001', 'teacher',
      'Ирина очень понятно объясняет, спасибо!', at(8))
    feedback.run(maxId, '00000000-0000-4000-8000-000000000002', 'academy',
      'Хотелось бы больше практики на моделях.', at(10))

    const audit = db.prepare('INSERT INTO audit_log (actor_user_id, action, meta, created_at) VALUES (?, ?, ?, ?)')
    audit.run(admin, 'student_approved', JSON.stringify({ student_id: annaId }), at(3))
    audit.run(admin, 'teacher_assigned', JSON.stringify({ student_id: maxId, teacher_id: irinaId }), at(3, '12:30:00'))

    const session = db.prepare(`
      INSERT INTO web_sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+30 days'))
    `)
    session.run(admin, sessionHash(VISUAL_SESSIONS.admin))
    session.run(teacherIrina, sessionHash(VISUAL_SESSIONS.teacher))
    session.run(anna, sessionHash(VISUAL_SESSIONS.student))
    session.run(max, sessionHash(VISUAL_SESSIONS.intern))
    session.run(olga, sessionHash(VISUAL_SESSIONS.moderation))
    session.run(newcomer, sessionHash(VISUAL_SESSIONS.newcomer))
  })

  run()
  db.close()
}
