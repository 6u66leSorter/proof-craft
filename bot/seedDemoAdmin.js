import db from './database.js'

const admin = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(9000000001)
if (!admin) throw new Error('Локальный демо-администратор не найден.')

const teachers = [
  ['Елена Громова', 9000000301],
  ['Артём Князев', 9000000302],
]
const students = [
  ['Кирилл Соколов', 'studying', 12, 'Петроградская'],
  ['Полина Нестерова', 'studying', 9, 'Чкаловская'],
  ['Роман Власов', 'studying', 7, 'Василеостровская'],
  ['Дарья Новикова', 'studying', 15, 'Лесная'],
  ['Владислав Мельников', 'moderation', 0, 'Московская'],
  ['Елизавета Климова', 'moderation', 0, 'Удельная'],
  ['Михаил Артемьев', 'moderation', 0, 'Парнас'],
  ['Ксения Фёдорова', 'moderation', 0, 'Комендантский проспект'],
]

const ensureUser = (telegramId, name) => {
  db.prepare(`INSERT OR IGNORE INTO users (telegram_id, first_name, role) VALUES (?, ?, 'guest')`).run(telegramId, name)
  return db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(telegramId).id
}

const seed = db.transaction(() => {
  const teacherIds = teachers.map(([name, telegramId]) => {
    const userId = ensureUser(telegramId, name)
    db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'teacher')").run(userId)
    db.prepare('INSERT OR IGNORE INTO teachers (user_id, full_name, about_me) VALUES (?, ?, ?)').run(userId, name, 'Преподаватель MADCAP Academy. Помогаю ученикам уверенно развивать технику и вкус к профессии.')
    return db.prepare('SELECT id FROM teachers WHERE user_id = ?').get(userId).id
  })

  const studentIds = students.map(([name, status, lessons, metro], index) => {
    const userId = ensureUser(9000000401 + index, name)
    db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'student')").run(userId)
    db.prepare('INSERT OR IGNORE INTO students (user_id, full_name, phone, lessons_count, status, metro, about_me) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, name, `+7 900 555-${String(10 + index).padStart(2, '0')}-${String(20 + index).padStart(2, '0')}`, lessons, status, metro, 'Вымышленный профиль для локального просмотра панели администратора.')
    const studentId = db.prepare('SELECT id FROM students WHERE user_id = ?').get(userId).id
    if (status === 'studying') db.prepare('INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)').run(studentId, teacherIds[index % teacherIds.length])
    return studentId
  })

  const applications = [
    ['Сергей Воронцов', '7900000501', '+7 900 777-10-01'],
    ['Марина Белова', '7900000502', '+7 900 777-10-02'],
  ]
  for (const [name, telegramId, phone] of applications) {
    const userId = ensureUser(Number(telegramId), name)
    db.prepare('INSERT OR IGNORE INTO teacher_applications (applicant_user_id, full_name, phone, status) VALUES (?, ?, ?, ?)').run(userId, name, phone, 'pending')
  }

  for (const studentId of studentIds.slice(0, 2)) {
    const student = db.prepare('SELECT full_name, phone, metro FROM students WHERE id = ?').get(studentId)
    db.prepare('INSERT OR IGNORE INTO student_profile_edits (student_id, new_full_name, new_phone, new_metro) VALUES (?, ?, ?, ?)').run(studentId, student.full_name, student.phone, `${student.metro} · данные уточнены`)
  }

  db.prepare('DELETE FROM app_notifications WHERE user_id = ? AND kind = ?').run(admin.id, 'demo_admin')
  for (const body of [
    'Новая заявка ученика: Владислав Мельников.',
    'Поступила заявка преподавателя: Сергей Воронцов.',
    'Два домашних задания ожидают проверки.',
    'Полина Нестерова запросила изменение профиля.',
    'Резервная копия демонстрационной базы создана успешно.',
  ]) db.prepare('INSERT INTO app_notifications (user_id, kind, body) VALUES (?, ?, ?)').run(admin.id, 'demo_admin', body)
})

seed()
console.log('Демо-данные для панели администратора добавлены.')
