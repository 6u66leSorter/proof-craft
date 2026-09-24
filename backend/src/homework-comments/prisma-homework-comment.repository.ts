import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  HomeworkCommentRepository,
  type HomeworkCommentTarget,
  type SaveHomeworkCommentCommand,
} from './homework-comment.repository.js'

@Injectable()
export class PrismaHomeworkCommentRepository extends HomeworkCommentRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super()
  }

  async findTarget(homeworkId: number): Promise<HomeworkCommentTarget | null> {
    const homework = await this.prisma.homeworks.findUnique({
      where: { id: homeworkId },
      select: {
        id: true,
        students: {
          select: {
            id: true,
            user_id: true,
            status: true,
            student_teachers: { select: { teachers: { select: { user_id: true } } } },
          },
        },
      },
    })
    if (!homework) return null
    return {
      homeworkId: homework.id,
      studentId: homework.students.id,
      studentUserId: homework.students.user_id,
      studentStatus: homework.students.status,
      assignedTeacherUserIds: homework.students.student_teachers.map(({ teachers }) => teachers.user_id),
    }
  }

  async save(command: SaveHomeworkCommentCommand): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.homework_comments.create({
        data: {
          homework_id: command.homeworkId,
          author_user_id: command.authorUserId,
          text_content: command.text,
          created_at: command.createdAt,
        },
      })
      if (command.notifications.length) {
        await transaction.app_notifications.createMany({
          data: command.notifications.map((n) => ({
            user_id: n.userId,
            kind: n.kind,
            body: n.body,
            payload: n.payload,
            created_at: command.createdAt,
          })),
        })
      }
    })
  }
}
