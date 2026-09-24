/** Ответ GET /api/session (legacy `bot/apiServer.js` и NestJS SessionModule). */
export type SessionStudent = {
  id: number
  full_name: string
  phone: string
  lessons_count: number
  status: 'moderation' | 'studying' | 'completed' | 'rejected'
  student_track: 'student' | 'intern' | 'barber'
  metro: string | null
  about_me: string
  has_avatar: boolean
  average_rating: number | null
  ratings_count: number
  teachers: { id: number; full_name: string }[]
}

export type Session = {
  hasUser: boolean
  role: 'admin' | 'teacher' | 'student' | null
  roles: string[]
  isAdmin: boolean
  isTeacher: boolean
  isStudent: boolean
  isGuest: boolean
  student: SessionStudent | null
  teacher: { id: number; full_name: string; about_me: string } | null
  unread_notifications_count: number
  vk_account_linked: boolean
}

export type WebAuthSession = { telegram_id: number }
