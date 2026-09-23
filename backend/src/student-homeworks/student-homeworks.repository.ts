export type StudentHomeworkReview = {
  id: number
  teacherId: number
  teacherName: string
  rating: number | null
  comment: string | null
  status: string
  createdAt: string
}

export type StudentHomeworkComment = {
  id: number
  authorUserId: number
  authorName: string
  authorRole: 'teacher' | 'student' | 'admin'
  textContent: string
  createdAt: string
}

export type StudentHomeworkAttachment = {
  id: number
  contentType: string
  fileId: string
}

export type StudentHomework = {
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
  reviews: StudentHomeworkReview[]
  comments: StudentHomeworkComment[]
  attachments: StudentHomeworkAttachment[]
}

export type StudentHomeworksSnapshot = {
  homeworks: StudentHomework[]
  averageRating: number | null
  ratingsCount: number
}

export abstract class StudentHomeworksRepository {
  abstract findByUserId(userId: number): Promise<StudentHomeworksSnapshot | null>
}
