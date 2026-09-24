import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  AdminStudentAssignmentRepository,
  type AdminAssignmentStudent,
  type AdminAssignmentTeacher,
  type SaveAdminStudentAssignment,
} from './admin-student-assignment.repository.js'

@Injectable()
export class PrismaAdminStudentAssignmentRepository
  implements AdminStudentAssignmentRepository
{
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findTeacher(id: number): Promise<AdminAssignmentTeacher | null> {
    const teacher = await this.prisma.teachers.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        full_name: true,
        users: {
          select: {
            telegram_id: true,
            user_roles: {
              where: { role: 'teacher' },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    })
    return teacher
      ? {
          id: teacher.id,
          userId: teacher.user_id,
          telegramId: Number(teacher.users.telegram_id),
          fullName: teacher.full_name,
          active: teacher.users.user_roles.length > 0,
        }
      : null
  }

  async findStudent(id: number): Promise<AdminAssignmentStudent | null> {
    const student = await this.prisma.students.findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        full_name: true,
        status: true,
        student_track: true,
        users: { select: { telegram_id: true } },
      },
    })
    return student
      ? {
          id: student.id,
          userId: student.user_id,
          telegramId: Number(student.users.telegram_id),
          fullName: student.full_name,
          status: student.status,
          track: student.student_track,
        }
      : null
  }

  async saveAssignment(command: SaveAdminStudentAssignment): Promise<void> {
    const notificationPayload = JSON.stringify({
      student_id: command.student.id,
      teacher_id: command.teacher.id,
    })
    const auditMeta = JSON.stringify({
      teacher_id: command.teacher.id,
      student_id: command.student.id,
    })
    await this.prisma.$transaction(async (transaction) => {
      if (command.mutateAssignment && command.action === 'assign') {
        await transaction.student_teachers.upsert({
          where: {
            student_id_teacher_id: {
              student_id: command.student.id,
              teacher_id: command.teacher.id,
            },
          },
          update: {},
          create: {
            student_id: command.student.id,
            teacher_id: command.teacher.id,
          },
        })
      } else if (command.action === 'unassign') {
        await transaction.student_teachers.deleteMany({
          where: {
            student_id: command.student.id,
            teacher_id: command.teacher.id,
          },
        })
      }
      await transaction.audit_log.create({
        data: {
          actor_user_id: command.actorUserId,
          action: `admin_${command.action}_student`,
          meta: auditMeta,
        },
      })
      await transaction.app_notifications.createMany({
        data: [
          {
            user_id: command.teacher.userId,
            kind:
              command.action === 'assign'
                ? 'student_assigned'
                : 'student_unassigned',
            body: command.teacherMessage,
            payload: notificationPayload,
          },
          {
            user_id: command.student.userId,
            kind:
              command.action === 'assign'
                ? 'teacher_assigned'
                : 'teacher_unassigned',
            body: command.studentMessage,
            payload: notificationPayload,
          },
        ],
      })
    })
  }
}
