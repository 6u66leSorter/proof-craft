import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  AdminTeacherApplicationRepository,
  type AdminTeacherApplicationDecisionResult,
  type AdminTeacherApplicationTarget,
  type SaveAdminTeacherApplicationDecision,
} from './admin-teacher-application.repository.js'

@Injectable()
export class PrismaAdminTeacherApplicationRepository
  implements AdminTeacherApplicationRepository
{
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<AdminTeacherApplicationTarget | null> {
    const application = await this.prisma.teacher_applications.findUnique({
      where: { id },
      select: {
        id: true,
        applicant_user_id: true,
        full_name: true,
        status: true,
      },
    })
    if (!application) return null

    const applicant = await this.prisma.users.findUnique({
      where: { id: application.applicant_user_id },
      select: {
        id: true,
        telegram_id: true,
        teachers: { select: { id: true } },
        user_roles: {
          where: { role: 'teacher' },
          select: { role: true },
          take: 1,
        },
      },
    })
    return {
      id: application.id,
      fullName: application.full_name,
      status: application.status,
      applicant: applicant
        ? {
            userId: applicant.id,
            telegramId: Number(applicant.telegram_id),
            teacherId: applicant.teachers?.id ?? null,
            hasTeacherRole: applicant.user_roles.length > 0,
          }
        : null,
    }
  }

  async saveDecision(
    command: SaveAdminTeacherApplicationDecision,
  ): Promise<AdminTeacherApplicationDecisionResult> {
    const applicant = command.application.applicant
    if (!applicant) return { alreadyTeacher: false, notifyApplicant: false }

    if (command.action === 'reject') {
      await this.prisma.$transaction([
        this.prisma.teacher_applications.update({
          where: { id: command.application.id },
          data: { status: 'rejected', updated_at: command.updatedAt },
        }),
        this.prisma.audit_log.create({
          data: {
            actor_user_id: command.actorUserId,
            action: 'teacher_application_rejected',
            meta: JSON.stringify({ application_id: command.application.id }),
            created_at: command.updatedAt,
          },
        }),
      ])
      return { alreadyTeacher: false, notifyApplicant: false }
    }

    if (applicant.teacherId != null && applicant.hasTeacherRole) {
      await this.prisma.teacher_applications.update({
        where: { id: command.application.id },
        data: { status: 'approved', updated_at: command.updatedAt },
      })
      return { alreadyTeacher: true, notifyApplicant: false }
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.user_roles.upsert({
        where: {
          user_id_role: { user_id: applicant.userId, role: 'teacher' },
        },
        update: {},
        create: {
          user_id: applicant.userId,
          role: 'teacher',
          created_at: command.updatedAt,
        },
      })
      if (applicant.teacherId == null) {
        await transaction.teachers.create({
          data: {
            user_id: applicant.userId,
            full_name: command.application.fullName,
            created_at: command.updatedAt,
          },
        })
      }
      await transaction.teacher_applications.update({
        where: { id: command.application.id },
        data: { status: 'approved', updated_at: command.updatedAt },
      })
      await transaction.audit_log.create({
        data: {
          actor_user_id: command.actorUserId,
          action: 'teacher_application_approved',
          meta: JSON.stringify({
            application_id: command.application.id,
            user_id: applicant.userId,
          }),
          created_at: command.updatedAt,
        },
      })
      await transaction.app_notifications.create({
        data: {
          user_id: applicant.userId,
          kind: 'teacher_application_result',
          body: command.notificationMessage,
          payload: JSON.stringify({ application_id: command.application.id }),
          created_at: command.updatedAt,
        },
      })
    })
    return { alreadyTeacher: false, notifyApplicant: true }
  }
}
