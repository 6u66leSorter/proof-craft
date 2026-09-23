import type { AdminStudentStatus } from './admin-read.request.js'

export type AdminTeacherApplication = {
  id: number
  fullName: string
  phone: string
  telegramId: number
  createdAt: string
}

export type AdminFeedback = {
  id: number
  subject: string
  message: string
  createdAt: string
  fullName: string
}

export type AdminTeacher = {
  id: number
  userId: number
  fullName: string
  phone: string | null
  telegramId: number
  username: string | null
  students: Array<{
    id: number
    fullName: string
    telegramId: number
    username: string | null
  }>
}

export type AdminStudentTeacher = { id: number; fullName: string }

export type AdminStudent = {
  id: number
  userId: number
  fullName: string
  phone: string
  telegramId: number
  username: string | null
  firstName: string | null
  lastName: string | null
  lessonsCount: number
  status: string
  studentTrack: string
  metro: string | null
  aboutMe: string | null
  avatarFileId: string | null
  teachers: AdminStudentTeacher[]
  averageRating: number | null
  ratingsCount: number
  pendingHomeworksCount: number
}

export type AdminHomeworkReview = {
  id: number
  teacherId: number
  teacherName: string
  rating: number | null
  comment: string | null
  status: string
  createdAt: string
}

export type AdminHomeworkComment = {
  id: number
  authorUserId: number
  authorName: string
  authorRole: 'teacher' | 'student' | 'admin'
  textContent: string
  createdAt: string
}

export type AdminHomework = {
  id: number
  studentId: number
  studentName: string
  lessonNumber: number | null
  isBonus: boolean
  haircutName: string | null
  status: string
  contentType: string
  fileId: string | null
  textContent: string | null
  createdAt: string
  revisionStudentText: string | null
  revisionStudentFileId: string | null
  reviews: AdminHomeworkReview[]
  comments: AdminHomeworkComment[]
  attachments: Array<{ id: number; contentType: string; fileId: string }>
}

export type AdminStudentDetail = {
  student: AdminStudent
  homeworks: AdminHomework[]
}

export type AdminAuditEntry = {
  id: number
  action: string
  meta: string | null
  createdAt: string
  actorUserId: number
  actorTelegramId: number
}

export abstract class AdminReadRepository {
  abstract listPendingTeacherApplications(): Promise<AdminTeacherApplication[]>
  abstract listFeedback(before?: number): Promise<AdminFeedback[]>
  abstract listTeachers(): Promise<AdminTeacher[]>
  abstract listStudents(status: AdminStudentStatus): Promise<AdminStudent[]>
  abstract findStudent(studentId: number): Promise<AdminStudentDetail | null>
  abstract listHomeworks(studentId: number | null): Promise<AdminHomework[]>
  abstract listAudit(limit: number): Promise<AdminAuditEntry[]>
}
