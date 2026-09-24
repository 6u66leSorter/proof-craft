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

export type HomeworkNotificationRecipient = {
  userId: number
  telegramId: number
}

export type HomeworkSubmissionStudent = {
  id: number
  fullName: string
  lessonsCount: number | null
  status: string
  teachers: HomeworkNotificationRecipient[]
  admins: HomeworkNotificationRecipient[]
}

export type HomeworkSubmissionFile = {
  fileId: string
  contentType: string
}

export type CreateHomeworkSubmissionCommand = {
  studentId: number
  lessonNumber: number | null
  isBonus: boolean
  haircutName: string | null
  textContent: string | null
  files: HomeworkSubmissionFile[]
  teacherNotificationBody: string
  adminNotificationBody: string
  teacherUserIds: number[]
  adminUserIds: number[]
}

export type SubmittedHomework = {
  id: number
  lessonNumber: number | null
  isBonus: boolean
  haircutName: string | null
  status: string
  contentType: string
  fileId: string | null
  textContent: string | null
  createdAt: string
  attachments: Array<{ id: number; contentType: string; fileId: string }>
}

export type CreateHomeworkSubmissionResult =
  | { kind: 'duplicate' }
  | { kind: 'created'; homework: SubmittedHomework }

export type SubmitRevisionCommand = {
  studentId: number
  homeworkId: number
  text: string
  /** Новый файл исправления; null — прежний файл сохраняется. */
  revisionFileId: string | null
  updatedAt: string
  notificationBody: string
  recipientUserIds: number[]
}

/** Порядок проверок: работа ученика → статус «на доработке» → непустой текст. */
export type SubmitRevisionResult = 'submitted' | 'not_found' | 'not_revision' | 'no_text'

export type EditPendingHomeworkCommand = {
  studentId: number
  homeworkId: number
  /** undefined — поле не передано и не меняется; пустая строка сохраняется как NULL. */
  textContent: string | undefined
  haircutName: string | undefined
  removePrimary: boolean
  removeAttachmentIds: number[]
  newAttachments: HomeworkSubmissionFile[]
  updatedAt: string
}

export type EditPendingHomeworkResult = 'edited' | 'not_found' | 'not_pending'

/** Строка работы: все колонки `homeworks` плюс данные ученика. */
export type RawHomeworkRow = Record<string, unknown> & { file_id: string | null }

export abstract class StudentHomeworksRepository {
  abstract findByUserId(userId: number): Promise<StudentHomeworksSnapshot | null>
  abstract findSubmissionStudent(userId: number): Promise<HomeworkSubmissionStudent | null>
  abstract hasPendingSubmission(
    studentId: number,
    lessonNumber: number | null,
    isBonus: boolean,
  ): Promise<boolean>
  abstract createSubmission(
    command: CreateHomeworkSubmissionCommand,
  ): Promise<CreateHomeworkSubmissionResult>
  abstract submitRevision(command: SubmitRevisionCommand): Promise<SubmitRevisionResult>
  abstract findHomeworkOwner(homeworkId: number): Promise<{ studentId: number; status: string } | null>
  abstract editPendingHomework(command: EditPendingHomeworkCommand): Promise<EditPendingHomeworkResult>
  abstract findRawHomework(homeworkId: number): Promise<RawHomeworkRow | null>
  abstract listAttachments(homeworkId: number): Promise<Array<{ id: number; contentType: string; fileId: string }>>
}
