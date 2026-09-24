import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  AdminStudentModerationRepository,
  type AdminModerationStudent,
  type SaveAdminStudentModeration,
} from './admin-student-moderation.repository.js'

@Injectable()
export class PrismaAdminStudentModerationRepository
  implements AdminStudentModerationRepository
{
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findStudent(studentId: number): Promise<AdminModerationStudent | null> {
    const student = await this.prisma.students.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        user_id: true,
        users: { select: { telegram_id: true } },
      },
    })
    return student
      ? {
          id: student.id,
          userId: student.user_id,
          telegramId: Number(student.users.telegram_id),
        }
      : null
  }

  async findFirstMissingTeacherId(teacherIds: number[]): Promise<number | null> {
    const teachers = await this.prisma.teachers.findMany({
      where: {
        id: { in: teacherIds },
        users: { user_roles: { some: { role: 'teacher' } } },
      },
      select: { id: true },
    })
    const existing = new Set(teachers.map(({ id }) => id))
    return teacherIds.find((id) => !existing.has(id)) ?? null
  }

  async saveModeration(command: SaveAdminStudentModeration): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      if (command.replaceTeacherIds?.length) {
        await transaction.student_teachers.deleteMany({
          where: { student_id: command.studentId },
        })
        await transaction.student_teachers.createMany({
          data: command.replaceTeacherIds.map((teacherId) => ({
            student_id: command.studentId,
            teacher_id: teacherId,
          })),
        })
      }
      await transaction.students.update({
        where: { id: command.studentId },
        data: { status: command.status, updated_at: command.updatedAt },
      })
      await transaction.audit_log.create({
        data: {
          actor_user_id: command.actorUserId,
          action: command.auditAction,
          meta: JSON.stringify({
            student_id: command.studentId,
            status: command.status,
          }),
        },
      })
      await transaction.app_notifications.create({
        data: {
          user_id: command.studentUserId,
          kind: 'student_status',
          body: command.message,
          payload: JSON.stringify({
            action: command.action,
            student_id: command.studentId,
          }),
        },
      })
    })
  }
}
