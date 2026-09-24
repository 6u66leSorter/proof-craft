export type HomeworkCommentTarget = {
  homeworkId: number
  studentId: number
  studentUserId: number
  /** Статус ученика: legacy пускает преподавателя только к studying и completed. */
  studentStatus: string
  /** Пользователи-преподаватели, назначенные ученику. */
  assignedTeacherUserIds: number[]
}

export type SaveHomeworkCommentCommand = {
  homeworkId: number
  authorUserId: number
  text: string
  createdAt: string
  notifications: Array<{ userId: number; kind: string; body: string; payload: string }>
}

export abstract class HomeworkCommentRepository {
  abstract findTarget(homeworkId: number): Promise<HomeworkCommentTarget | null>
  abstract save(command: SaveHomeworkCommentCommand): Promise<void>
}
