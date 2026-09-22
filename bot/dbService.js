import crypto from 'crypto'
import db from './database.js'

export const UserRole = {
  GUEST: 'guest',
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
}

export const StudentStatus = {
  MODERATION: 'moderation',
  STUDYING: 'studying',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
}

/** Подуровень внутри обучения (админка): как в `files_new` — ученик / стажёр / барбер */
export const StudentTrack = {
  STUDENT: 'student',
  INTERN: 'intern',
  BARBER: 'barber',
}

export const HomeworkStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVISION: 'revision',
}

export const ChatContentType = {
  TEXT: 'text',
  PHOTO: 'photo',
  VIDEO: 'video',
  DOCUMENT: 'document',
  SYSTEM: 'system',
}

export const getUserByTelegramId = (telegramId) => {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId)
}

export const getUserById = (userId) => {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
}

/** Реальный VK user id платформы (не синтетический app id). */
export const getUserByVkUserId = (vkUserId) => {
  if (!Number.isFinite(vkUserId) || vkUserId <= 0) return undefined
  return db.prepare('SELECT * FROM users WHERE vk_user_id = ?').get(vkUserId)
}

export const setUserVkUserId = (userId, vkUserId) => {
  return db
    .prepare(`UPDATE users SET vk_user_id = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(vkUserId, userId)
}

export const createUser = (
  telegramId,
  username,
  firstName,
  lastName,
  role = UserRole.STUDENT,
  vkUserId = null,
) => {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, first_name, last_name, role, vk_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    telegramId,
    username || null,
    firstName || null,
    lastName || null,
    role,
    vkUserId == null ? null : vkUserId,
  )
  db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)').run(result.lastInsertRowid, role)
  return result.lastInsertRowid
}

export const getOrCreateUser = (telegramId, username, firstName, lastName, vkUserId = null) => {
  let user = vkUserId != null ? getUserByVkUserId(vkUserId) : null
  if (!user) {
    user = getUserByTelegramId(telegramId)
  }
  if (!user) {
    const userId = createUser(telegramId, username, firstName, lastName, UserRole.GUEST, vkUserId)
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
  } else if (user?.role) {
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)').run(user.id, user.role)
    if (vkUserId != null && user.vk_user_id == null) {
      db.prepare(`UPDATE users SET vk_user_id = ?, updated_at = datetime('now') WHERE id = ?`).run(vkUserId, user.id)
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)
    }
  }
  return user
}

const sha256Hex = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')

export const createVkLinkTokenForUser = (userId, ttlMinutes = 15) => {
  db.prepare(`DELETE FROM vk_link_tokens WHERE user_id = ? OR expires_at < datetime('now')`).run(userId)
  const mins = Math.min(120, Math.max(5, Math.floor(Number(ttlMinutes) || 15)))
  /** 4 цифры с ведущими нулями (0000–9999) */
  const plain = String(crypto.randomInt(0, 10_000)).padStart(4, '0')
  const th = sha256Hex(plain)
  db.prepare(`
    INSERT INTO vk_link_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, datetime('now', ?))
  `).run(userId, th, `+${mins} minutes`)
  const row = db.prepare(`SELECT expires_at FROM vk_link_tokens WHERE token_hash = ?`).get(th)
  return { plain, expires_at: row?.expires_at ?? null }
}

export const consumeVkLinkToken = (plainToken) => {
  const hash = sha256Hex(plainToken.trim())
  const row = db
    .prepare(
      `
    SELECT id, user_id FROM vk_link_tokens
    WHERE token_hash = ? AND expires_at > datetime('now')
  `,
    )
    .get(hash)
  if (!row) return null
  db.prepare('DELETE FROM vk_link_tokens WHERE id = ?').run(row.id)
  return row.user_id
}

const newOpaqueToken = () => crypto.randomBytes(32).toString('base64url')

export const createWebLoginRequest = (provider, ttlMinutes = 15) => {
  const plain = newOpaqueToken()
  const minutes = Math.min(30, Math.max(5, Math.floor(Number(ttlMinutes) || 15)))
  db.prepare(`DELETE FROM web_login_requests WHERE expires_at < datetime('now')`).run()
  db.prepare(`
    INSERT INTO web_login_requests (provider, token_hash, expires_at)
    VALUES (?, ?, datetime('now', ?))
  `).run(provider, sha256Hex(plain), `+${minutes} minutes`)
  return { token: plain, expiresInSeconds: minutes * 60 }
}

/** Возвращает false, если токен просрочен, уже применён или относится к другой платформе. */
export const approveWebLoginRequest = (plainToken, provider, userId) => {
  const result = db.prepare(`
    UPDATE web_login_requests
    SET user_id = ?, approved_at = datetime('now')
    WHERE token_hash = ? AND provider = ? AND user_id IS NULL AND expires_at > datetime('now')
  `).run(userId, sha256Hex(String(plainToken || '').trim()), provider)
  return result.changes === 1
}

/** Забирает подтверждённый запрос ровно один раз и сразу выпускает отдельную веб-сессию. */
export const consumeWebLoginRequest = (plainToken, sessionDays = 14) =>
  db.transaction(() => {
    const hash = sha256Hex(String(plainToken || '').trim())
    const request = db.prepare(`
      SELECT id, user_id FROM web_login_requests
      WHERE token_hash = ? AND user_id IS NOT NULL AND expires_at > datetime('now')
    `).get(hash)
    if (!request) return null
    db.prepare('DELETE FROM web_login_requests WHERE id = ?').run(request.id)
    const token = newOpaqueToken()
    const days = Math.min(30, Math.max(1, Math.floor(Number(sessionDays) || 14)))
    db.prepare(`DELETE FROM web_sessions WHERE expires_at < datetime('now')`).run()
    db.prepare(`
      INSERT INTO web_sessions (user_id, token_hash, expires_at)
      VALUES (?, ?, datetime('now', ?))
    `).run(request.user_id, sha256Hex(token), `+${days} days`)
    return { token, userId: request.user_id }
  })()

export const getWebLoginRequestState = (plainToken) => {
  const row = db.prepare(`
    SELECT user_id, expires_at FROM web_login_requests
    WHERE token_hash = ? AND expires_at > datetime('now')
  `).get(sha256Hex(String(plainToken || '').trim()))
  if (!row) return 'expired'
  return row.user_id ? 'approved' : 'pending'
}

export const getWebSessionUser = (plainToken) => {
  const hash = sha256Hex(String(plainToken || '').trim())
  if (!hash) return null
  const row = db.prepare(`
    SELECT u.* FROM web_sessions ws
    JOIN users u ON u.id = ws.user_id
    WHERE ws.token_hash = ? AND ws.expires_at > datetime('now')
  `).get(hash)
  if (row) {
    db.prepare(`UPDATE web_sessions SET last_seen_at = datetime('now') WHERE token_hash = ?`).run(hash)
  }
  return row || null
}

export const deleteWebSession = (plainToken) =>
  db.prepare('DELETE FROM web_sessions WHERE token_hash = ?').run(sha256Hex(String(plainToken || '').trim())).changes

export const userBlocksDeletionDueToRelations = (userId) => {
  if (db.prepare('SELECT 1 FROM students WHERE user_id = ?').get(userId)) return 'students'
  if (db.prepare('SELECT 1 FROM teachers WHERE user_id = ?').get(userId)) return 'teachers'
  if (db.prepare('SELECT 1 FROM chat_messages WHERE sender_user_id = ? LIMIT 1').get(userId)) {
    return 'chat_messages'
  }
  return null
}

export const deleteBareUserCascade = (userId) => {
  const blocker = userBlocksDeletionDueToRelations(userId)
  if (blocker) return { ok: false, reason: blocker }
  db.transaction(() => {
    db.prepare('DELETE FROM audit_log WHERE actor_user_id = ?').run(userId)
    db.prepare('DELETE FROM app_notifications WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM vk_link_tokens WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId)
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
  })()
  return { ok: true }
}

export const updateUserProfile = (userId, username, firstName, lastName) => {
  return db
    .prepare(
      `
    UPDATE users
    SET username = COALESCE(?, username),
        first_name = COALESCE(?, first_name),
        last_name = COALESCE(?, last_name),
        updated_at = datetime('now')
    WHERE id = ?
  `,
    )
    .run(username ?? null, firstName ?? null, lastName ?? null, userId)
}

export const getUserRoles = (userId) => {
  return db
    .prepare('SELECT role FROM user_roles WHERE user_id = ? ORDER BY role')
    .all(userId)
    .map((row) => row.role)
}

export const userHasRole = (userId, role) => {
  return Boolean(db.prepare('SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?').get(userId, role))
}

export const addUserRole = (userId, role) => {
  return db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)').run(userId, role)
}

export const removeUserRole = (userId, role) => {
  return db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(userId, role)
}

export const createStudent = (userId, fullName, phone, lessonsCount, metro = null) => {
  const stmt = db.prepare(`
    INSERT INTO students (user_id, full_name, phone, lessons_count, status, metro)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    userId,
    fullName,
    phone,
    lessonsCount,
    StudentStatus.MODERATION,
    metro != null && String(metro).trim() ? String(metro).trim() : null,
  )
  return result.lastInsertRowid
}

export const getStudentByUserId = (userId) => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.user_id = ?
  `,
    )
    .get(userId)
}

export const getStudentByTelegramId = (telegramId) => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE u.telegram_id = ?
  `,
    )
    .get(telegramId)
}

export const getStudentById = (studentId) => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `,
    )
    .get(studentId)
}

export const updateStudentStatus = (studentId, status) => {
  const stmt = db.prepare("UPDATE students SET status = ?, updated_at = datetime('now') WHERE id = ?")
  return stmt.run(status, studentId)
}

export const updateStudentLessonsAndTrack = (studentId, { lessons_count, student_track }) => {
  const parts = []
  const vals = []
  if (lessons_count != null) {
    const n = Number(lessons_count)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) throw new Error('Некорректное число занятий.')
    parts.push('lessons_count = ?')
    vals.push(n)
  }
  if (student_track != null) {
    const t = String(student_track)
    if (!['student', 'intern', 'barber'].includes(t)) throw new Error('Некорректный уровень ученика.')
    parts.push('student_track = ?')
    vals.push(t)
  }
  if (!parts.length) return { changes: 0 }
  vals.push(studentId)
  const stmt = db.prepare(`UPDATE students SET ${parts.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
  return db.transaction(() => {
    const result = stmt.run(...vals)
    if (student_track === StudentTrack.BARBER) {
      db.prepare('DELETE FROM student_teachers WHERE student_id = ?').run(studentId)
    }
    return result
  })()
}

/** Полная замена привязок к преподавателям */
export const replaceStudentTeachers = (studentId, teacherIds) => {
  const isBarber = getStudentById(studentId)?.student_track === StudentTrack.BARBER
  const uniq = isBarber ? [] : [...new Set((teacherIds || []).map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0))]
  const del = db.prepare('DELETE FROM student_teachers WHERE student_id = ?')
  const ins = db.prepare('INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
  const tx = db.transaction(() => {
    del.run(studentId)
    for (const tid of uniq) ins.run(studentId, tid)
  })
  tx()
}

export const countPendingHomeworksForStudent = (studentId) => {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM homeworks WHERE student_id = ? AND status = ?`)
    .get(studentId, HomeworkStatus.PENDING)
  return row?.c != null ? Number(row.c) : 0
}

export const getStudentsByStatus = (status) => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = ?
    ORDER BY s.created_at DESC
  `,
    )
    .all(status)
}

export const getActiveStudents = () => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.status IN ('studying', 'completed')
    ORDER BY s.full_name
  `,
    )
    .all()
}

/** Публичные профили одобренных обучающихся всех трёх категорий. */
export const isStudentVisibleOnGuestPortfolio = (studentId) => {
  const s = getStudentById(studentId)
  if (!s) return false
  if (s.status !== StudentStatus.STUDYING) return false
  return true
}

export const getGuestPortfolioStudents = () => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM students s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = ?
    ORDER BY s.full_name COLLATE NOCASE
  `,
    )
    .all(StudentStatus.STUDYING)
}

export const upsertPendingTeacherApplication = (applicantUserId, fullName, phone) => {
  db.prepare(`DELETE FROM teacher_applications WHERE applicant_user_id = ? AND status = 'pending'`).run(
    applicantUserId,
  )
  const stmt = db.prepare(`
    INSERT INTO teacher_applications (applicant_user_id, full_name, phone, status)
    VALUES (?, ?, ?, 'pending')
  `)
  const result = stmt.run(applicantUserId, String(fullName).trim(), String(phone).trim())
  return result.lastInsertRowid
}

export const getPendingTeacherApplications = () => {
  return db
    .prepare(
      `
    SELECT ta.*, u.telegram_id
    FROM teacher_applications ta
    JOIN users u ON ta.applicant_user_id = u.id
    WHERE ta.status = 'pending'
    ORDER BY datetime(ta.created_at) DESC
  `,
    )
    .all()
}

export const getTeacherApplicationById = (id) => {
  return db
    .prepare(
      `
    SELECT ta.*, u.telegram_id
    FROM teacher_applications ta
    JOIN users u ON ta.applicant_user_id = u.id
    WHERE ta.id = ?
  `,
    )
    .get(id)
}

export const setTeacherApplicationStatus = (applicationId, status) => {
  return db
    .prepare(
      `
    UPDATE teacher_applications
    SET status = ?, updated_at = datetime('now')
    WHERE id = ?
  `,
    )
    .run(status, applicationId)
}

export const getAllAdmins = () => {
  return db
    .prepare(
      `
    SELECT u.*
    FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    WHERE ur.role = 'admin'
  `,
    )
    .all()
}

export const createTeacher = (userId, fullName) => {
  const stmt = db.prepare('INSERT INTO teachers (user_id, full_name) VALUES (?, ?)')
  const result = stmt.run(userId, fullName)
  return result.lastInsertRowid
}

export const deleteTeacherByUserId = (userId) => {
  return db.prepare('DELETE FROM teachers WHERE user_id = ?').run(userId)
}

export const getTeacherById = (teacherId) => {
  return db
    .prepare(
      `
    SELECT t.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM teachers t
    JOIN users u ON t.user_id = u.id
    WHERE t.id = ?
  `,
    )
    .get(teacherId)
}

export const getAllTeachers = () => {
  return db
    .prepare(
      `
    SELECT t.*, u.telegram_id, u.username, u.first_name, u.last_name,
      (
        SELECT ta.phone FROM teacher_applications ta
        WHERE ta.applicant_user_id = t.user_id AND ta.status = 'approved'
        ORDER BY datetime(ta.updated_at) DESC, ta.id DESC
        LIMIT 1
      ) AS phone
    FROM teachers t
    JOIN users u ON t.user_id = u.id
    ORDER BY t.full_name
  `,
    )
    .all()
}

export const getAllHomeworks = () => {
  return db
    .prepare(
      `
    SELECT h.*,
           s.full_name as student_name,
           s.user_id as student_user_id,
           u.telegram_id as student_telegram_id,
           (SELECT COUNT(*) FROM homework_files hf WHERE hf.homework_id = h.id) as extra_files_count
    FROM homeworks h
    JOIN students s ON h.student_id = s.id
    JOIN users u ON s.user_id = u.id
    ORDER BY h.created_at DESC
  `,
    )
    .all()
}

export const getTeacherByUserId = (userId) => {
  return db
    .prepare(
      `
    SELECT t.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM teachers t
    JOIN users u ON t.user_id = u.id
    WHERE t.user_id = ?
  `,
    )
    .get(userId)
}

export const assignTeacherToStudent = (studentId, teacherId) => {
  if (getStudentById(studentId)?.student_track === StudentTrack.BARBER) return { changes: 0 }
  const stmt = db.prepare('INSERT OR IGNORE INTO student_teachers (student_id, teacher_id) VALUES (?, ?)')
  return stmt.run(studentId, teacherId)
}

export const unassignStudentFromTeacher = (studentId, teacherId) => {
  return db
    .prepare('DELETE FROM student_teachers WHERE student_id = ? AND teacher_id = ?')
    .run(studentId, teacherId)
}

export const getTeachersByStudent = (studentId) => {
  return db
    .prepare(
      `
    SELECT t.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM teachers t
    JOIN student_teachers st ON t.id = st.teacher_id
    JOIN users u ON t.user_id = u.id
    WHERE st.student_id = ?
  `,
    )
    .all(studentId)
}

export const getStudentsByTeacher = (teacherId) => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM students s
    JOIN student_teachers st ON s.id = st.student_id
    JOIN users u ON s.user_id = u.id
    WHERE st.teacher_id = ?
    AND s.status IN ('studying', 'completed')
  `,
    )
    .all(teacherId)
}

export const getChatStudentsForUser = (userId) => {
  const roles = getUserRoles(userId)
  const student = getStudentByUserId(userId)
  if (student) {
    return [student]
  }

  if (roles.includes(UserRole.ADMIN) || roles.includes(UserRole.TEACHER)) {
    return getActiveStudents()
  }
  return []
}

export const canUserAccessStudentChat = (userId, studentId) => {
  const student = getStudentByUserId(userId)
  if (student && student.id === studentId) {
    return true
  }
  const roles = getUserRoles(userId)
  if (roles.includes(UserRole.ADMIN) || roles.includes(UserRole.TEACHER)) {
    return Boolean(getStudentById(studentId))
  }
  return false
}

export const createChatMessage = ({
  student_id,
  sender_user_id,
  text_content = null,
  content_type = ChatContentType.TEXT,
  file_id = null,
}) => {
  const stmt = db.prepare(`
    INSERT INTO chat_messages (student_id, sender_user_id, text_content, content_type, file_id)
    VALUES (?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    student_id,
    sender_user_id,
    text_content ? String(text_content).trim() : null,
    content_type,
    file_id || null,
  )
  return result.lastInsertRowid
}

export const getChatMessageById = (messageId) => {
  return db
    .prepare(
      `
    SELECT cm.*,
           s.full_name as student_name,
           u.telegram_id as sender_telegram_id,
           u.first_name as sender_first_name,
           u.last_name as sender_last_name,
           u.username as sender_username
    FROM chat_messages cm
    LEFT JOIN students s ON s.id = cm.student_id
    LEFT JOIN users u ON u.id = cm.sender_user_id
    WHERE cm.id = ?
  `,
    )
    .get(messageId)
}

export const getChatMessagesByStudent = (studentId, limit = 80) => {
  const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 80)))
  return db
    .prepare(
      `
    SELECT cm.*,
           s.full_name as student_name,
           u.telegram_id as sender_telegram_id,
           u.first_name as sender_first_name,
           u.last_name as sender_last_name,
           u.username as sender_username
    FROM chat_messages cm
    LEFT JOIN students s ON s.id = cm.student_id
    LEFT JOIN users u ON u.id = cm.sender_user_id
    WHERE cm.student_id = ?
    ORDER BY cm.id DESC
    LIMIT ?
  `,
    )
    .all(studentId, lim)
    .reverse()
}

export const createHomework = (
  studentId,
  lessonNumber,
  isBonus,
  contentType,
  fileId,
  textContent,
  haircutName = null,
) => {
  const stmt = db.prepare(`
    INSERT INTO homeworks (student_id, lesson_number, is_bonus, content_type, file_id, text_content, status, haircut_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    studentId,
    lessonNumber || null,
    isBonus ? 1 : 0,
    contentType,
    fileId || null,
    textContent || null,
    HomeworkStatus.PENDING,
    haircutName || null,
  )
  return result.lastInsertRowid
}

/** Уже есть работа на проверке с тем же уроком или ожидающий бонус */
export const getPendingHomeworkDuplicateForSlot = (studentId, lessonNumber, isBonus) => {
  if (isBonus) {
    return db
      .prepare(
        `
      SELECT id FROM homeworks
      WHERE student_id = ? AND status = ? AND is_bonus = 1
      LIMIT 1
    `,
      )
      .get(studentId, HomeworkStatus.PENDING)
  }
  const ln = lessonNumber == null || !Number.isFinite(Number(lessonNumber)) ? null : Number(lessonNumber)
  return db
    .prepare(
      `
    SELECT id FROM homeworks
    WHERE student_id = ? AND status = ? AND is_bonus = 0 AND lesson_number IS ?
    LIMIT 1
  `,
    )
    .get(studentId, HomeworkStatus.PENDING, ln)
}

export const insertHomeworkFile = (homeworkId, fileId, contentType, sortOrder) => {
  const stmt = db.prepare(`
    INSERT INTO homework_files (homework_id, file_id, content_type, sort_order)
    VALUES (?, ?, ?, ?)
  `)
  const result = stmt.run(homeworkId, fileId, contentType, sortOrder)
  return result.lastInsertRowid
}

export const getHomeworkAttachments = (homeworkId) => {
  return db
    .prepare(
      `
    SELECT id, homework_id, file_id, content_type, sort_order, created_at
    FROM homework_files
    WHERE homework_id = ?
    ORDER BY sort_order ASC, id ASC
  `,
    )
    .all(homeworkId)
}

export const getHomeworkAttachmentById = (attachmentId) => {
  return db.prepare(`SELECT * FROM homework_files WHERE id = ?`).get(attachmentId)
}

export const getHomeworkAttachmentsByHomeworkIds = (homeworkIds) => {
  if (!homeworkIds?.length) return new Map()
  const uniq = [...new Set(homeworkIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
  if (!uniq.length) return new Map()
  const placeholders = uniq.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
    SELECT id, homework_id, file_id, content_type, sort_order
    FROM homework_files
    WHERE homework_id IN (${placeholders})
    ORDER BY homework_id, sort_order ASC, id ASC
  `,
    )
    .all(...uniq)
  const map = new Map()
  for (const r of rows) {
    const k = r.homework_id
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(r)
  }
  return map
}

export const getStudentRatingStats = (studentId) => {
  const row = db
    .prepare(
      `
    SELECT AVG(hr.rating) as avg_rating, COUNT(hr.rating) as ratings_count
    FROM homework_reviews hr
    JOIN homeworks h ON hr.homework_id = h.id
    WHERE h.student_id = ? AND hr.rating IS NOT NULL AND hr.status = 'approved'
  `,
    )
    .get(studentId)
  return {
    average_rating: row?.avg_rating != null ? Number(row.avg_rating) : null,
    ratings_count: row?.ratings_count != null ? Number(row.ratings_count) : 0,
  }
}

export const getHomeworkById = (homeworkId) => {
  return db
    .prepare(
      `
    SELECT h.*,
           s.full_name as student_name,
           s.user_id as student_user_id,
           u.telegram_id as student_telegram_id
    FROM homeworks h
    JOIN students s ON h.student_id = s.id
    JOIN users u ON s.user_id = u.id
    WHERE h.id = ?
  `,
    )
    .get(homeworkId)
}

export const getHomeworksByStudent = (studentId, includeReviewed = false) => {
  const query = includeReviewed
    ? `
    SELECT h.*, 
           (SELECT COUNT(*) FROM homework_reviews hr WHERE hr.homework_id = h.id) as review_count,
           (SELECT COUNT(*) FROM homework_files hf WHERE hf.homework_id = h.id) as extra_files_count
    FROM homeworks h
    WHERE h.student_id = ?
    ORDER BY 
      CASE WHEN h.status = 'pending' THEN 0 ELSE 1 END,
      h.created_at DESC
  `
    : `
    SELECT h.*, 
           (SELECT COUNT(*) FROM homework_reviews hr WHERE hr.homework_id = h.id) as review_count,
           (SELECT COUNT(*) FROM homework_files hf WHERE hf.homework_id = h.id) as extra_files_count
    FROM homeworks h
    WHERE h.student_id = ? AND h.status = 'pending'
    ORDER BY h.created_at DESC
  `
  return db.prepare(query).all(studentId)
}

export const getPendingHomeworksForTeacher = (teacherId) => {
  return db
    .prepare(
      `
    SELECT h.*, s.full_name as student_name, s.user_id as student_user_id
    FROM homeworks h
    JOIN students s ON h.student_id = s.id
    JOIN student_teachers st ON s.id = st.student_id
    WHERE st.teacher_id = ? AND h.status = 'pending'
    ORDER BY h.created_at DESC
  `,
    )
    .all(teacherId)
}

export const getStudentsWithPendingCount = (teacherId) => {
  return db
    .prepare(
      `
    SELECT s.*, u.telegram_id, u.username, u.first_name, u.last_name,
           COUNT(CASE WHEN h.status = 'pending' THEN 1 END) as pending_count
    FROM students s
    JOIN users u ON s.user_id = u.id
    JOIN student_teachers st ON s.id = st.student_id
    LEFT JOIN homeworks h ON s.id = h.student_id
    WHERE st.teacher_id = ? AND s.status IN ('studying', 'completed')
    GROUP BY s.id
    HAVING pending_count > 0
    ORDER BY pending_count DESC, s.full_name
  `,
    )
    .all(teacherId)
}

export const submitStudentHomeworkRevision = (studentId, homeworkId, text, optionalRevisionFilePath) => {
  const hw = getHomeworkById(homeworkId)
  if (!hw || Number(hw.student_id) !== Number(studentId)) {
    return { ok: false, code: 'NOT_FOUND' }
  }
  if (hw.status !== HomeworkStatus.REVISION) {
    return { ok: false, code: 'NOT_REVISION' }
  }
  const note = String(text || '').trim()
  if (!note) {
    return { ok: false, code: 'NO_TEXT' }
  }
  const fileId = optionalRevisionFilePath != null ? optionalRevisionFilePath : null
  db.prepare(
    `
    UPDATE homeworks
    SET revision_student_text = ?,
        revision_student_file_id = COALESCE(?, revision_student_file_id),
        status = ?,
        updated_at = datetime('now')
    WHERE id = ? AND student_id = ?
  `,
  ).run(note, fileId, HomeworkStatus.PENDING, homeworkId, studentId)
  return { ok: true }
}

export const createHomeworkReview = (homeworkId, teacherId, rating, comment, status) => db.transaction(() => {
  const stmt = db.prepare(`
    INSERT INTO homework_reviews (homework_id, teacher_id, rating, comment, status)
    VALUES (?, ?, ?, ?, ?)
  `)
  const result = stmt.run(homeworkId, teacherId, rating || null, comment || null, status)
  
  const reviewCount = db
    .prepare('SELECT COUNT(*) as count FROM homework_reviews WHERE homework_id = ?')
    .get(homeworkId)
  
  if (reviewCount.count > 0) {
    const newStatus = status === 'approved' ? HomeworkStatus.APPROVED : HomeworkStatus.REVISION
    db.prepare("UPDATE homeworks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
      newStatus,
      homeworkId,
    )
  }
  
  const hw = getHomeworkById(homeworkId)
  if (status === 'approved' && hw && !hw.is_bonus && [5,10,15].includes(Number(hw.lesson_number))) {
    const invite = db.prepare('INSERT OR IGNORE INTO feedback_invites (student_id,milestone) VALUES (?,?)').run(hw.student_id, hw.lesson_number)
    if (invite.changes) {
      const student = getStudentById(hw.student_id)
      createAppNotification(student.user_id, 'feedback_invite', `Урок №${hw.lesson_number} принят. Расскажите администратору, как проходит обучение. Отзыв недоступен преподавателю.`, { screen: 'feedback' })
    }
  }
  return result.lastInsertRowid
})()

export const getHomeworkReviews = (homeworkId) => {
  return db
    .prepare(
      `
    SELECT hr.*, t.full_name as teacher_name, u.telegram_id as teacher_telegram_id
    FROM homework_reviews hr
    JOIN teachers t ON hr.teacher_id = t.id
    JOIN users u ON t.user_id = u.id
    WHERE hr.homework_id = ?
    ORDER BY hr.created_at DESC
  `,
    )
    .all(homeworkId)
}

/** Для гостевого портфолио: последняя принятая проверка с оценкой */
export const getGuestHomeworkSummaries = (studentId) => {
  const rows = getHomeworksByStudent(studentId, true)
  return rows.map((h) => {
    const reviews = getHomeworkReviews(h.id).filter((r) => r.status === 'approved')
    const top = reviews[0]
    return {
      id: h.id,
      lesson_number: h.lesson_number,
      is_bonus: Boolean(h.is_bonus),
      haircut_name: h.haircut_name || null,
      status: h.status,
      content_type: h.content_type,
      text_content: h.text_content,
      created_at: h.created_at,
      rating: top?.rating != null ? Number(top.rating) : null,
      review_comment: top?.comment || null,
      reviewer_name: top?.teacher_name || null,
    }
  })
}

const parseNotificationPayload = (raw) => {
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const createAppNotification = (userId, kind, body, payload = null) => {
  if (!userId) {
    return null
  }
  const payloadStr = payload == null ? null : JSON.stringify(payload)
  const result = db
    .prepare(
      `
    INSERT INTO app_notifications (user_id, kind, body, payload)
    VALUES (?, ?, ?, ?)
  `,
    )
    .run(userId, String(kind || 'info'), String(body || '').slice(0, 2000), payloadStr)
  return result.lastInsertRowid
}

export const createAppNotificationsForAdmins = (kind, body, payload = null) => {
  for (const admin of getAllAdmins()) {
    createAppNotification(admin.id, kind, body, payload)
  }
}

export const getAppNotificationsForUser = (userId, limit = 40) => {
  const rows = db
    .prepare(
      `
    SELECT id, kind, body, payload, read_at, created_at
    FROM app_notifications
    WHERE user_id = ?
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `,
    )
    .all(userId, limit)

  const notifications = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    payload: parseNotificationPayload(r.payload),
    read_at: r.read_at,
    created_at: r.created_at,
  }))

  const unreadRow = db
    .prepare(`SELECT COUNT(*) as c FROM app_notifications WHERE user_id = ? AND read_at IS NULL`)
    .get(userId)

  return { notifications, unread_count: Number(unreadRow?.c ?? 0) }
}

export const getAppNotificationsForTelegramId = (telegramId, limit = 40) => {
  const user = getUserByTelegramId(telegramId)
  if (!user) {
    return { notifications: [], unread_count: 0 }
  }
  return getAppNotificationsForUser(user.id, limit)
}

export const getUnreadAppNotificationCount = (userId) => {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM app_notifications WHERE user_id = ? AND read_at IS NULL`)
    .get(userId)
  return Number(row?.c ?? 0)
}

export const markAppNotificationRead = (userId, notificationId) => {
  return db
    .prepare(
      `
    UPDATE app_notifications
    SET read_at = datetime('now')
    WHERE id = ? AND user_id = ? AND read_at IS NULL
  `,
    )
    .run(notificationId, userId).changes
}

export const markAllAppNotificationsRead = (userId) => {
  return db
    .prepare(
      `
    UPDATE app_notifications
    SET read_at = datetime('now')
    WHERE user_id = ? AND read_at IS NULL
  `,
    )
    .run(userId).changes
}

export const pruneAppNotifications = () => {
  const days = Math.min(365, Math.max(7, Number(process.env.APP_NOTIFICATIONS_RETENTION_DAYS || 90)))
  return db
    .prepare(`DELETE FROM app_notifications WHERE datetime(created_at) < datetime('now', '-${days} days')`)
    .run().changes
}

export const appendAuditLog = (actorUserId, action, meta = null) => {
  if (!actorUserId || !action) {
    return null
  }
  const metaStr = meta == null ? null : JSON.stringify(meta)
  return db
    .prepare(`INSERT INTO audit_log (actor_user_id, action, meta) VALUES (?, ?, ?)`)
    .run(actorUserId, String(action).slice(0, 120), metaStr).lastInsertRowid
}

export const getAuditLogEntries = (limit = 80) => {
  const lim = Math.min(200, Math.max(1, Math.floor(Number(limit) || 80)))
  return db
    .prepare(
      `
    SELECT a.id, a.action, a.meta, a.created_at, a.actor_user_id, u.telegram_id as actor_telegram_id
    FROM audit_log a
    JOIN users u ON u.id = a.actor_user_id
    ORDER BY datetime(a.created_at) DESC
    LIMIT ?
  `,
    )
    .all(lim)
}

export const updatePendingHomework = (homeworkId, { text_content, haircut_name, remove_primary, remove_attachment_ids, new_attachments }) =>
  db.transaction(() => {
    const hw = db.prepare('SELECT * FROM homeworks WHERE id = ?').get(homeworkId)
    if (!hw) throw new Error('Задание не найдено.')
    if (hw.status !== 'pending') throw new Error('Редактировать можно только задания, ещё не проверенные преподавателем.')

    const setParts = ["updated_at = datetime('now')"]
    const setVals = []

    if (text_content !== undefined) { setParts.push('text_content = ?'); setVals.push(text_content || null) }
    if (haircut_name !== undefined) { setParts.push('haircut_name = ?'); setVals.push(haircut_name || null) }
    if (remove_primary) { setParts.push('file_id = ?'); setVals.push(null) }

    setVals.push(homeworkId)
    db.prepare(`UPDATE homeworks SET ${setParts.join(', ')} WHERE id = ?`).run(...setVals)

    if (remove_attachment_ids?.length) {
      const placeholders = remove_attachment_ids.map(() => '?').join(',')
      db.prepare(`DELETE FROM homework_files WHERE homework_id = ? AND id IN (${placeholders})`).run(homeworkId, ...remove_attachment_ids)
    }

    if (new_attachments?.length) {
      const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM homework_files WHERE homework_id = ?').get(homeworkId).m
      new_attachments.forEach((a, i) => {
        db.prepare('INSERT INTO homework_files (homework_id, file_id, content_type, sort_order) VALUES (?, ?, ?, ?)')
          .run(homeworkId, a.file_id, a.content_type, maxOrder + i + 1)
      })
    }
  })()

export const submitStudentProfileEdit = (studentId, { full_name, phone, metro }) => {
  db.prepare("UPDATE student_profile_edits SET status = 'rejected' WHERE student_id = ? AND status = 'pending'").run(studentId)
  return db.prepare(
    `INSERT INTO student_profile_edits (student_id, new_full_name, new_phone, new_metro) VALUES (?, ?, ?, ?)`
  ).run(studentId, full_name, phone, metro || null)
}

export const getPendingProfileEdits = () =>
  db.prepare(`
    SELECT spe.id, spe.student_id, spe.new_full_name, spe.new_phone, spe.new_metro, spe.created_at,
           s.full_name AS current_full_name, s.phone AS current_phone, s.metro AS current_metro,
           u.telegram_id
    FROM student_profile_edits spe
    JOIN students s ON s.id = spe.student_id
    JOIN users u ON u.id = s.user_id
    WHERE spe.status = 'pending'
    ORDER BY spe.created_at DESC
  `).all()

export const approveProfileEdit = (editId, adminTelegramId) =>
  db.transaction(() => {
    const edit = db.prepare('SELECT * FROM student_profile_edits WHERE id = ? AND status = ?').get(editId, 'pending')
    if (!edit) throw new Error('Заявка не найдена или уже обработана.')
    db.prepare("UPDATE students SET full_name = ?, phone = ?, metro = ?, updated_at = datetime('now') WHERE id = ?")
      .run(edit.new_full_name, edit.new_phone, edit.new_metro, edit.student_id)
    db.prepare("UPDATE student_profile_edits SET status = 'approved', reviewed_at = datetime('now'), reviewed_by_telegram_id = ? WHERE id = ?")
      .run(adminTelegramId, editId)
  })()

export const rejectProfileEdit = (editId, adminTelegramId, comment) => {
  const edit = db.prepare('SELECT * FROM student_profile_edits WHERE id = ? AND status = ?').get(editId, 'pending')
  if (!edit) throw new Error('Заявка не найдена или уже обработана.')
  db.prepare("UPDATE student_profile_edits SET status = 'rejected', reviewed_at = datetime('now'), reviewed_by_telegram_id = ?, admin_comment = ? WHERE id = ?")
    .run(adminTelegramId, comment || null, editId)
}

export const updateStudentAvatar = (studentId, fileId) => {
  db.prepare("UPDATE students SET avatar_file_id = ?, updated_at = datetime('now') WHERE id = ?").run(fileId, studentId)
}

export const updateStudentAbout = (studentId, aboutMe) =>
  db.prepare("UPDATE students SET about_me = ?, updated_at = datetime('now') WHERE id = ?").run(aboutMe || null, studentId)

export const updateTeacherAbout = (teacherId, aboutMe) =>
  db.prepare("UPDATE teachers SET about_me = ?, updated_at = datetime('now') WHERE id = ?").run(aboutMe || null, teacherId)

export const createHomeworkComment = (homeworkId, authorUserId, textContent) =>
  db
    .prepare('INSERT INTO homework_comments (homework_id, author_user_id, text_content) VALUES (?, ?, ?)')
    .run(homeworkId, authorUserId, textContent)

export const getHomeworkComments = (homeworkId) =>
  db
    .prepare(
      `SELECT hc.*, u.first_name, u.last_name, u.username,
        CASE
          WHEN EXISTS (SELECT 1 FROM teachers t WHERE t.user_id = u.id) THEN 'teacher'
          WHEN EXISTS (SELECT 1 FROM students s WHERE s.user_id = u.id) THEN 'student'
          ELSE 'admin'
        END AS author_role
      FROM homework_comments hc
      JOIN users u ON u.id = hc.author_user_id
      WHERE hc.homework_id = ?
      ORDER BY hc.id ASC`,
    )
    .all(homeworkId)
