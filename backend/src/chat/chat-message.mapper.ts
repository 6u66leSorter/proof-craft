import type { ChatMessageRecord } from './chat.repository.js'

type SenderRole = {
  key: 'system' | 'student' | 'admin' | 'teacher' | 'user'
  label: string
  color: string
}

const senderLabel = (message: ChatMessageRecord): string => {
  if (message.contentType === 'system') return 'Система'
  const fullName = [message.senderFirstName, message.senderLastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (fullName) return fullName
  if (message.senderUsername) return `@${message.senderUsername}`
  if (message.senderTelegramId) return `ID ${message.senderTelegramId}`
  if (message.senderUserId) return `Пользователь ${message.senderUserId}`
  return 'Пользователь'
}

const senderRole = (message: ChatMessageRecord): SenderRole => {
  if (message.contentType === 'system') {
    return { key: 'system', label: 'система', color: 'var(--dim)' }
  }
  if (message.threadStudentUserId === message.senderUserId) {
    return { key: 'student', label: 'ученик', color: 'var(--gold)' }
  }
  if (message.senderRoles.includes('admin')) {
    return { key: 'admin', label: 'админ', color: 'var(--danger)' }
  }
  if (message.senderRoles.includes('teacher')) {
    return { key: 'teacher', label: 'преподаватель', color: 'var(--success)' }
  }
  return { key: 'user', label: 'пользователь', color: 'var(--gold)' }
}

export const mapChatMessage = (message: ChatMessageRecord): object => {
  const role = senderRole(message)
  return {
    id: message.id,
    student_id: message.studentId,
    sender_user_id: message.senderUserId,
    sender_name: senderLabel(message),
    sender_role: role.label,
    sender_role_key: role.key,
    sender_role_color: role.color,
    sender_telegram_id: message.senderTelegramId,
    text_content: message.textContent,
    content_type: message.contentType,
    has_file: Boolean(message.fileId),
    created_at: message.createdAt,
  }
}
