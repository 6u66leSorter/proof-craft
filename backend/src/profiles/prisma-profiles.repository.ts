import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import { ProfilesRepository } from './profiles.repository.js'

@Injectable()
export class PrismaProfilesRepository implements ProfilesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findStudentForEdit(userId: number): Promise<{
    studentId: number
    fullName: string
    status: string
  } | null> {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      select: { id: true, full_name: true, status: true },
    })
    return student
      ? { studentId: student.id, fullName: student.full_name, status: student.status }
      : null
  }

  async submitStudentProfileEdit(
    studentId: number,
    edit: { fullName: string; phone: string; metro: string | null },
  ): Promise<number> {
    return await this.prisma.$transaction(async (transaction) => {
      await transaction.student_profile_edits.updateMany({
        where: { student_id: studentId, status: 'pending' },
        data: { status: 'rejected' },
      })
      const created = await transaction.student_profile_edits.create({
        data: {
          student_id: studentId,
          new_full_name: edit.fullName,
          new_phone: edit.phone,
          new_metro: edit.metro,
        },
        select: { id: true },
      })
      return created.id
    })
  }

  async recordStudentProfileEditSubmission(
    actorUserId: number,
    studentId: number,
    studentFullName: string,
  ): Promise<number[]> {
    return await this.prisma.$transaction(async (transaction) => {
      const admins = await transaction.users.findMany({
        where: { user_roles: { some: { role: 'admin' } } },
        select: { id: true, telegram_id: true },
      })
      await transaction.audit_log.create({
        data: {
          actor_user_id: actorUserId,
          action: 'student_profile_edit_submitted',
          meta: JSON.stringify({ student_id: studentId }),
        },
      })
      const body = `Ученик ${studentFullName} отправил заявку на изменение профиля.`
      for (const admin of admins) {
        await transaction.app_notifications.create({
          data: {
            user_id: admin.id,
            kind: 'profile_edit_pending',
            body,
            payload: JSON.stringify({ student_id: studentId }),
          },
        })
      }
      return admins.map(({ telegram_id }) => Number(telegram_id))
    })
  }

  async updateStudentAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.prisma.students.updateMany({
      where: { user_id: userId },
      data: { about_me: aboutMe, updated_at: updatedAt },
    })
    return result.count > 0
  }

  async updateTeacherAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.prisma.teachers.updateMany({
      where: { user_id: userId },
      data: { about_me: aboutMe, updated_at: updatedAt },
    })
    return result.count > 0
  }
}
