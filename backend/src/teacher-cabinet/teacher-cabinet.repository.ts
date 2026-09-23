export type TeacherStudentTeacher = { id: number; fullName: string }

export type TeacherPendingHomework = {
  id: number
  studentId: number
  studentName: string
  lessonNumber: number | null
  isBonus: boolean
  haircutName: string | null
  createdAt: string
}

export type TeacherStudentSummary = {
  id: number
  fullName: string
  lessonsCount: number
  status: string
  studentTrack: string
  metro: string | null
  aboutMe: string | null
  avatarFileId: string | null
  telegramId: number
  username: string | null
  firstName: string | null
  lastName: string | null
  teachers: TeacherStudentTeacher[]
  averageRating: number | null
  ratingsCount: number
  pendingHomeworks: TeacherPendingHomework[]
}

export type TeacherHomeworkReview = {
  id: number
  teacherId: number
  teacherName: string
  rating: number | null
  comment: string | null
  status: string
  createdAt: string
}

export type TeacherHomeworkComment = {
  id: number
  authorUserId: number
  authorName: string
  authorRole: 'teacher' | 'student' | 'admin'
  textContent: string
  createdAt: string
}

export type TeacherHomework = {
  id: number
  studentId: number
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
  reviews: TeacherHomeworkReview[]
  comments: TeacherHomeworkComment[]
  attachments: Array<{ id: number; contentType: string; fileId: string }>
}

export type TeacherStudentHomeworks = {
  student: TeacherStudentSummary
  homeworks: TeacherHomework[]
}

export abstract class TeacherCabinetRepository {
  abstract findTeacherIdByUserId(userId: number): Promise<number | null>
  abstract listStudents(teacherId: number | null): Promise<TeacherStudentSummary[]>
  abstract findStudentHomeworks(
    studentId: number,
    teacherId: number | null,
    includeReviewed: boolean,
  ): Promise<TeacherStudentHomeworks | null>
}
