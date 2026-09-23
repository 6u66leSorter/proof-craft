import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  HomeworkFileRepository,
  type HomeworkAttachmentAccess,
  type HomeworkFileAccess,
} from './homework-file.repository.js'

@Injectable()
export class PrismaHomeworkFileRepository implements HomeworkFileRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAccess(homeworkId: number, userId: number | null): Promise<HomeworkFileAccess | null> {
    const homework = await this.prisma.homeworks.findUnique({
      where: { id: homeworkId },
      select: {
        file_id: true,
        revision_student_file_id: true,
        content_type: true,
        students: {
          select: {
            user_id: true,
            student_teachers: {
              select: { teachers: { select: { user_id: true } } },
            },
          },
        },
      },
    })
    if (!homework) return null
    return {
      fileId: homework.file_id,
      revisionFileId: homework.revision_student_file_id,
      contentType: homework.content_type,
      isOwner: userId != null && homework.students.user_id === userId,
      isAssignedTeacher:
        userId != null &&
        homework.students.student_teachers.some(
          ({ teachers }) => teachers.user_id === userId,
        ),
    }
  }

  async findAttachmentAccess(
    homeworkId: number,
    attachmentId: number,
    userId: number | null,
  ): Promise<HomeworkAttachmentAccess | null> {
    const attachment = await this.prisma.homework_files.findFirst({
      where: { id: attachmentId, homework_id: homeworkId },
      select: {
        file_id: true,
        content_type: true,
        homeworks: {
          select: {
            students: {
              select: {
                user_id: true,
                student_teachers: {
                  select: { teachers: { select: { user_id: true } } },
                },
              },
            },
          },
        },
      },
    })
    if (!attachment) return null
    return {
      fileId: attachment.file_id,
      contentType: attachment.content_type,
      isOwner: userId != null && attachment.homeworks.students.user_id === userId,
      isAssignedTeacher:
        userId != null &&
        attachment.homeworks.students.student_teachers.some(
          ({ teachers }) => teachers.user_id === userId,
        ),
    }
  }
}
