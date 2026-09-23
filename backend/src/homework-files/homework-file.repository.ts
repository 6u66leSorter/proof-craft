export type HomeworkFileAccess = {
  fileId: string | null
  contentType: string
  isOwner: boolean
  isAssignedTeacher: boolean
}

export abstract class HomeworkFileRepository {
  abstract findAccess(
    homeworkId: number,
    userId: number | null,
  ): Promise<HomeworkFileAccess | null>
}
