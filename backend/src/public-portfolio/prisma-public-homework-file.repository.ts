import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  PublicHomeworkFileRepository,
  type PublicHomeworkAttachmentRecord,
  type PublicHomeworkFileRecord,
} from './public-homework-file.repository.js'

const PUBLIC_STUDENT_STATUS = 'studying'
const PUBLIC_HOMEWORK_STATUS = 'approved'

@Injectable()
export class PrismaPublicHomeworkFileRepository implements PublicHomeworkFileRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findApprovedHomeworkFile(
    homeworkId: number,
  ): Promise<PublicHomeworkFileRecord | null> {
    const homework = await this.prisma.homeworks.findFirst({
      where: {
        id: homeworkId,
        status: PUBLIC_HOMEWORK_STATUS,
        students: { status: PUBLIC_STUDENT_STATUS },
      },
      select: { file_id: true, content_type: true },
    })
    return homework
      ? { fileId: homework.file_id, contentType: homework.content_type }
      : null
  }

  async findAttachment(
    homeworkId: number,
    attachmentId: number,
  ): Promise<PublicHomeworkAttachmentRecord | null> {
    const attachment = await this.prisma.homework_files.findFirst({
      where: { id: attachmentId, homework_id: homeworkId },
      select: {
        file_id: true,
        content_type: true,
        homeworks: {
          select: { status: true, students: { select: { status: true } } },
        },
      },
    })
    if (!attachment) return null

    return {
      fileId: attachment.file_id,
      contentType: attachment.content_type,
      isPublicHomework:
        attachment.homeworks.status === PUBLIC_HOMEWORK_STATUS &&
        attachment.homeworks.students.status === PUBLIC_STUDENT_STATUS,
    }
  }
}
