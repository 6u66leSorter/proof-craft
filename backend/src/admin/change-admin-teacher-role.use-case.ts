import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import type { ChangeAdminTeacherRoleCommand } from './admin-teacher-role.body.js'
import { AdminTeacherRoleRepository } from './admin-teacher-role.repository.js'

const assignedMessage =
  'Вам назначена роль преподавателя. Откройте мини-приложение для проверки работ.'
const removedMessage =
  'Роль преподавателя снята. Если это ошибка — свяжитесь с администратором.'

@Injectable()
export class ChangeAdminTeacherRoleUseCase {
  constructor(
    @Inject(AdminTeacherRoleRepository)
    private readonly teachers: AdminTeacherRoleRepository,
    @Inject(UserNotificationGateway)
    private readonly notifications: UserNotificationGateway,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: ChangeAdminTeacherRoleCommand,
  ): Promise<{ ok: true }> {
    const admin = requireAdminPrincipal(principal)
    const target = await this.teachers.findTargetByTelegramId(
      command.targetTelegramId,
    )
    if (!target) {
      throw new HttpException(
        {
          ok: false,
          error: 'Пользователь не найден. Попросите его отправить /start боту.',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    const teacherName = command.action === 'assign' && target.teacherId == null
      ? command.fullName?.trim() ||
        [target.firstName, target.lastName].filter(Boolean).join(' ') ||
        target.username ||
        'Преподаватель'
      : null
    const message = command.action === 'assign' ? assignedMessage : removedMessage
    await this.teachers.saveRoleChange({
      actorUserId: admin.id,
      target,
      action: command.action,
      teacherName,
      notificationKind:
        command.action === 'assign'
          ? 'teacher_role_assigned'
          : 'teacher_role_removed',
      message,
    })
    await this.notifications.send(target.telegramId, message)
    return { ok: true }
  }
}
