import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import type { DecideAdminTeacherApplicationCommand } from './admin-teacher-application.body.js'
import { AdminTeacherApplicationRepository } from './admin-teacher-application.repository.js'

const approvalMessage =
  'Ваша заявка на роль преподавателя одобрена. Откройте мини-приложение снова — доступ «Преподаватель» должен появиться после проверки сессии.'

type DecisionResponse = {
  ok: true
  data: { status: 'approved' | 'rejected'; already_teacher?: true }
}

@Injectable()
export class DecideAdminTeacherApplicationUseCase {
  constructor(
    @Inject(AdminTeacherApplicationRepository)
    private readonly applications: AdminTeacherApplicationRepository,
    @Inject(UserNotificationGateway)
    private readonly notifications: UserNotificationGateway,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: DecideAdminTeacherApplicationCommand,
  ): Promise<DecisionResponse> {
    const admin = requireAdminPrincipal(principal)
    const application = await this.applications.findById(command.applicationId)
    if (!application || application.status !== 'pending') {
      throw new HttpException(
        { ok: false, error: 'Заявка не найдена или уже обработана.' },
        HttpStatus.NOT_FOUND,
      )
    }
    if (!application.applicant) {
      throw new HttpException(
        { ok: false, error: 'Пользователь заявки не найден.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const result = await this.applications.saveDecision({
      actorUserId: admin.id,
      application,
      action: command.action,
      updatedAt: sqliteTimestamp(),
      notificationMessage: approvalMessage,
    })
    if (result.notifyApplicant) {
      await this.notifications.send(
        application.applicant.telegramId,
        approvalMessage,
      )
    }
    return {
      ok: true,
      data: {
        status: command.action === 'approve' ? 'approved' : 'rejected',
        ...(result.alreadyTeacher ? { already_teacher: true as const } : {}),
      },
    }
  }
}
