export type HomeworkAccess = {
  isOwner: boolean
  isAssignedTeacher: boolean
}

export type HomeworkFileAccess = HomeworkAccess & {
  fileId: string | null
  revisionFileId: string | null
  contentType: string
}

export type HomeworkAttachmentAccess = HomeworkAccess & {
  fileId: string
  contentType: string
}

export abstract class HomeworkFileRepository {
  abstract findAccess(
    homeworkId: number,
    userId: number | null,
  ): Promise<HomeworkFileAccess | null>

  abstract findAttachmentAccess(
    homeworkId: number,
    attachmentId: number,
    userId: number | null,
  ): Promise<HomeworkAttachmentAccess | null>
}
