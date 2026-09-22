import db from './database.js'
import { UserRole, createTeacher, addUserRole, getUserRoles } from './dbService.js'

const args = process.argv.slice(2)

if (args.length < 2) {
  console.log(`
Использование:
  node bot/setupUser.js <role> <telegram_id> [full_name]

Роли:
  admin    - назначить администратором
  teacher  - назначить преподавателем

Примеры:
  node bot/setupUser.js admin 123456789
  node bot/setupUser.js teacher 123456789 "Иван Иванов"
`)
  process.exit(1)
}

const [role, telegramIdStr, fullName] = args
const telegramId = parseInt(telegramIdStr, 10)

if (![UserRole.ADMIN, UserRole.TEACHER].includes(role)) {
  console.error(`Неверная роль: ${role}. Используйте "admin" или "teacher"`)
  process.exit(1)
}

if (isNaN(telegramId)) {
  console.error(`Неверный Telegram ID: ${telegramIdStr}`)
  process.exit(1)
}

let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId)

if (!user) {
  console.log(`Пользователь с Telegram ID ${telegramId} не найден.`)
  console.log('Попросите пользователя сначала отправить /start боту.')
  process.exit(1)
}

addUserRole(user.id, role)
const roles = getUserRoles(user.id)
const roleLabel = role === UserRole.ADMIN ? 'администратором' : 'преподавателем'
console.log(`✅ Пользователь ${telegramId} назначен ${roleLabel}`)
console.log(`ℹ️  Текущие роли: ${roles.join(', ')}`)

if (role === UserRole.TEACHER) {
  const teacher = db.prepare('SELECT * FROM teachers WHERE user_id = ?').get(user.id)
  if (!teacher) {
    const teacherName = fullName || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Преподаватель'
    createTeacher(user.id, teacherName)
    console.log(`✅ Создана запись преподавателя: ${teacherName}`)
  } else {
    console.log('ℹ️  Запись преподавателя уже существует')
  }
}

process.exit(0)

