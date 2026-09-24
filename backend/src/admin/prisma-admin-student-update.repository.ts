import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  AdminStudentUpdateRepository,
  type AdminStudentProfilePatch,
  type AdminStudentUpdateAudit,
  type AdminStudentUpdateTarget,
} from './admin-student-update.repository.js'

@Injectable()
export class PrismaAdminStudentUpdateRepository
  implements AdminStudentUpdateRepository
{
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findStudent(id: number): Promise<AdminStudentUpdateTarget | null> {
    const student = await this.prisma.students.findUnique({
      where: { id },
      select: { id: true, status: true, student_track: true },
    })
    return student
      ? { id: student.id, status: student.status, track: student.student_track }
      : null
  }

  async applyProfilePatch(command: AdminStudentProfilePatch): Promise<void> {
    if (command.lessonsCount === undefined && command.studentTrack === undefined) {
      return
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.students.update({
        where: { id: command.studentId },
        data: {
          ...(command.lessonsCount === undefined
            ? {}
            : { lessons_count: command.lessonsCount }),
          ...(command.studentTrack === undefined
            ? {}
            : { student_track: command.studentTrack }),
          updated_at: command.updatedAt,
        },
      })
      if (command.studentTrack === 'barber') {
        await transaction.student_teachers.deleteMany({
          where: { student_id: command.studentId },
        })
      }
    })
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

  async replaceTeachers(
    studentId: number,
    teacherIds: number[],
    allowAssignments: boolean,
  ): Promise<void> {
    const uniqueTeacherIds = [...new Set(teacherIds)]
    await this.prisma.$transaction(async (transaction) => {
      await transaction.student_teachers.deleteMany({ where: { student_id: studentId } })
      if (allowAssignments && uniqueTeacherIds.length) {
        await transaction.student_teachers.createMany({
          data: uniqueTeacherIds.map((teacherId) => ({
            student_id: studentId,
            teacher_id: teacherId,
          })),
        })
      }
    })
  }

  async appendAudit(command: AdminStudentUpdateAudit): Promise<void> {
    await this.prisma.audit_log.create({
      data: {
        actor_user_id: command.actorUserId,
        action: 'admin_update_student',
        meta: JSON.stringify({
          student_id: command.studentId,
          lessons_count: command.lessonsCount ?? null,
          student_track: command.studentTrack ?? null,
          teacher_ids: command.teacherIds ?? null,
        }),
      },
    })
  }
}
