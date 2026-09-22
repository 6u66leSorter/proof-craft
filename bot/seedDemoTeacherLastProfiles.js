import db from './database.js'

const teacher = db.prepare(`SELECT t.id FROM teachers t JOIN users u ON u.id = t.user_id WHERE u.telegram_id = ?`).get(9000000002)
if (!teacher) throw new Error('Демонстрационный преподаватель не найден.')

const students = db.prepare(`
  SELECT s.* FROM students s
  JOIN student_teachers st ON st.student_id = s.id
  WHERE st.teacher_id = ? AND s.status IN ('studying','completed')
  ORDER BY st.id DESC LIMIT 5
`).all(teacher.id).reverse()

const templates = db.prepare(`SELECT * FROM homeworks WHERE student_id = (SELECT id FROM students WHERE full_name = 'Алексей Барбер') ORDER BY lesson_number LIMIT 5`).all()
const descriptions = [
  ['Развиваю технику фейда и хочу научиться уверенно работать с разными типами волос.', 'Проспект Просвещения', 14, 'intern'],
  ['Пришла в профессию благодаря интересу к стилю и работе с людьми. Люблю аккуратные формы и детали.', 'Чернышевская', 15, 'intern'],
  ['Начал обучение, чтобы сменить профессию и открыть собственное барбер-кресло. Сейчас собираю первое портфолио.', 'Площадь Мужества', 11, 'student'],
  ['Хочу сочетать классические техники с современными текстурами и создавать узнаваемые образы.', 'Василеостровская', 17, 'barber'],
  ['Мне нравится видеть результат работы сразу. Учусь делать чистые переходы и правильно выстраивать форму.', 'Лесная', 12, 'student'],
]
const workNames = ['Низкий фейд', 'Текстурированный кроп', 'Классика ножницами', 'Оформление бороды', 'Итоговый образ']

if (students.length !== 5 || templates.length < 5) throw new Error('Недостаточно демо-данных для пяти профилей.')

db.transaction(() => {
  students.forEach((student, studentIndex) => {
    const [about, metro, lessons, track] = descriptions[studentIndex]
    db.prepare('UPDATE students SET about_me = ?, metro = ?, lessons_count = ?, student_track = ? WHERE id = ?').run(about, metro, lessons, track, student.id)
    const generated = db.prepare("SELECT id FROM homeworks WHERE student_id = ? AND (text_content LIKE '[profile-demo]%' OR text_content LIKE '[teacher-last-demo]%')").all(student.id)
    for (const homework of generated) db.prepare('DELETE FROM homeworks WHERE id = ?').run(homework.id)

    templates.forEach((template, index) => {
      const inserted = db.prepare(`INSERT INTO homeworks (student_id, lesson_number, is_bonus, content_type, file_id, text_content, status, haircut_name) VALUES (?, ?, 0, ?, ?, ?, 'approved', ?)`).run(
        student.id,
        index + 1,
        template.content_type,
        template.file_id,
        `[teacher-last-demo] ${workNames[index]}. Практическая работа ученика для демонстрации профиля.`,
        workNames[index],
      )
      db.prepare(`INSERT INTO homework_reviews (homework_id, teacher_id, rating, comment, status) VALUES (?, ?, ?, ?, 'approved')`).run(
        inserted.lastInsertRowid,
        teacher.id,
        4 + ((studentIndex + index) % 2),
        'Хорошая работа. Обрати внимание на чистоту перехода и продолжай развивать форму.',
      )
    })
  })
})()

console.log(`Заполнены крайние профили преподавателя: ${students.map((student) => student.full_name).join(', ')}`)
