export type PublicHomeworkFileRecord = {
  fileId: string | null
  contentType: string
}

export type PublicHomeworkAttachmentRecord = PublicHomeworkFileRecord & {
  isPublicHomework: boolean
}

export abstract class PublicHomeworkFileRepository {
  abstract findApprovedHomeworkFile(
    homeworkId: number,
  ): Promise<PublicHomeworkFileRecord | null>

  abstract findAttachment(
    homeworkId: number,
    attachmentId: number,
  ): Promise<PublicHomeworkAttachmentRecord | null>
}
