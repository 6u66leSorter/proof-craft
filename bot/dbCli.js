import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'
import db from './database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = join(__dirname, '..', 'data')
const dbPath = join(dataDir, 'barber.db')
mkdirSync(dataDir, { recursive: true })

// Keep direct initialization compatibility with existing data path.
new Database(dbPath).close()

const [command, value] = process.argv.slice(2)

const print = (rows) => {
  if (!rows || rows.length === 0) {
    console.log('Ничего не найдено.')
    return
  }
  console.table(rows)
}

const toInt = (input) => {
  const parsed = Number.parseInt(String(input || ''), 10)
  if (!Number.isInteger(parsed)) {
    throw new Error('Нужно передать числовой идентификатор (например telegram_id).')
  }
  return parsed
}

const help = () => {
  console.log(`Доступные команды:
  npm run db:users
  npm run db:roles
  npm run db:students
  npm run db:teachers
  npm run db:admins
  npm run db:user -- <telegram_id>
  npm run db:delete -- <telegram_id>
  npm run db:assignments
  npm run db:homeworks`)
}

try {
  switch (command) {
    case 'users':
      print(
        db
          .prepare(
            'SELECT id, telegram_id, username, first_name, last_name, role, created_at FROM users ORDER BY id DESC',
          )
          .all(),
      )
      break
    case 'roles':
      print(
        db
          .prepare(
            "SELECT u.id, u.telegram_id, u.first_name, u.last_name, GROUP_CONCAT(ur.role, ', ') AS roles FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id GROUP BY u.id ORDER BY u.id DESC",
          )
          .all(),
      )
      break
    case 'students':
      print(
        db
          .prepare(
            'SELECT s.id AS student_id, u.id AS user_id, u.telegram_id, s.full_name, s.phone, s.status, s.lessons_count FROM students s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC',
          )
          .all(),
      )
      break
    case 'teachers':
      print(
        db
          .prepare(
            'SELECT t.id AS teacher_id, u.id AS user_id, u.telegram_id, t.full_name FROM teachers t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC',
          )
          .all(),
      )
      break
    case 'admins':
      print(
        db
          .prepare(
            "SELECT u.id, u.telegram_id, u.first_name, u.last_name FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role = 'admin' ORDER BY u.id DESC",
          )
          .all(),
      )
      break
    case 'user': {
      const telegramId = toInt(value)
      print(
        db
          .prepare(
            'SELECT u.*, s.id AS student_id, s.status AS student_status, t.id AS teacher_id FROM users u LEFT JOIN students s ON s.user_id = u.id LEFT JOIN teachers t ON t.user_id = u.id WHERE u.telegram_id = ?',
          )
          .all(telegramId),
      )
      break
    }
    case 'delete': {
      const telegramId = toInt(value)
      const info = db.prepare('DELETE FROM users WHERE telegram_id = ?').run(telegramId)
      console.log(`Удалено пользователей: ${info.changes}`)
      break
    }
    case 'assignments':
      print(
        db
          .prepare(
            'SELECT st.teacher_id, t.full_name AS teacher_name, st.student_id, s.full_name AS student_name FROM student_teachers st JOIN teachers t ON t.id = st.teacher_id JOIN students s ON s.id = st.student_id ORDER BY st.teacher_id, st.student_id',
          )
          .all(),
      )
      break
    case 'homeworks':
      print(
        db
          .prepare(
            'SELECT h.id, h.status, h.content_type, h.lesson_number, h.is_bonus, s.full_name AS student_name, h.created_at FROM homeworks h JOIN students s ON s.id = h.student_id ORDER BY h.id DESC LIMIT 50',
          )
          .all(),
      )
      break
    default:
      help()
  }
} catch (error) {
  console.error(`Ошибка: ${error.message}`)
  process.exit(1)
}
