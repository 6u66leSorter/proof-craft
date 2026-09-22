import db from './database.js'

const profiles = [
  { about: 'Я пришёл в барберинг из дизайна и люблю точные формы. Хочу уверенно работать с классикой и современными текстурами.', metro: 'Петроградская', lessons: 18, track: 'barber' },
  { about: 'Начала обучение после нескольких лет работы стилистом. Особенно люблю короткие женские формы и мягкие переходы.', metro: 'Чернышевская', lessons: 14, track: 'intern' },
  { about: 'Барберинг привлёк меня возможностью менять образ человека за одну встречу. Развиваю фейды и работу с бородой.', metro: 'Василеостровская', lessons: 16, track: 'intern' },
  { about: 'Раньше занимался фотографией, поэтому внимательно отношусь к силуэту и деталям. Собираю сильное портфолио мужских стрижек.', metro: 'Московская', lessons: 12, track: 'student' },
  { about: 'Мечтаю открыть собственное кресло и создать спокойный сервис для постоянных гостей. Сейчас укрепляю базовую технику.', metro: 'Лесная', lessons: 10, track: 'student' },
]

const students = db.prepare(`SELECT * FROM students WHERE status IN ('studying','completed') ORDER BY full_name LIMIT 5`).all()
const teacher = db.prepare('SELECT id FROM teachers ORDER BY id LIMIT 1').get()
const templates = db.prepare(`SELECT * FROM homeworks WHERE student_id = (SELECT id FROM students WHERE full_name = 'Алексей Барбер') ORDER BY lesson_number LIMIT 5`).all()

if (students.length < 5 || !teacher || !templates.length) throw new Error('Недостаточно исходных демо-данных.')

db.transaction(() => {
  students.forEach((student, studentIndex) => {
    const profile = profiles[studentIndex]
    db.prepare('UPDATE students SET about_me = ?, metro = ?, lessons_count = ?, student_track = ? WHERE id = ?').run(profile.about, profile.metro, profile.lessons, profile.track, student.id)
    db.prepare('INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)').run(student.id, teacher.id)

    if (student.full_name === 'Алексей Барбер') return
    const oldDemo = db.prepare("SELECT id FROM homeworks WHERE student_id = ? AND text_content LIKE '[profile-demo]%' ").all(student.id)
    for (const row of oldDemo) db.prepare('DELETE FROM homeworks WHERE id = ?').run(row.id)

    templates.forEach((template, index) => {
      const result = db.prepare(`INSERT INTO homeworks (student_id, lesson_number, is_bonus, content_type, file_id, text_content, status, haircut_name) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)`).run(
        student.id,
        index + 1,
        0,
        template.content_type,
        template.file_id,
        `[profile-demo] ${['Классический фейд', 'Текстурированный кроп', 'Оформление бороды', 'Мягкий переход', 'Финальная работа'][index]}. Выполнено в рамках практического занятия.`,
        ['Классический фейд', 'Текстурированный кроп', 'Оформление бороды', 'Мягкий переход', 'Финальная работа'][index],
      )
      db.prepare(`INSERT INTO homework_reviews (homework_id, teacher_id, rating, comment, status) VALUES (?, ?, ?, ?, 'approved')`).run(
        result.lastInsertRowid,
        teacher.id,
        4 + ((studentIndex + index) % 2),
        'Работа выполнена уверенно. Продолжай развивать чистоту формы и детализацию перехода.',
      )
    })
  })
})()

console.log(`Заполнено профилей: ${students.map((student) => student.full_name).join(', ')}`)
