import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import type { SubmitProfileEditCommand } from './profile-edit.body.js'
import { ProfilesRepository } from './profiles.repository.js'

@Injectable()
export class SubmitStudentProfileEditUseCase {
  constructor(
    @Inject(ProfilesRepository)
    private readonly profiles: ProfilesRepository,
    @Inject(UserNotificationGateway)
    private readonly notifications: UserNotificationGateway,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: SubmitProfileEditCommand,
  ): Promise<{ ok: true }> {
    if (!principal.user) {
      throw new HttpException(
        { ok: false, error: 'Пользователь не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    const student = await this.profiles.findStudentForEdit(principal.user.id)
    if (!student) {
      throw new HttpException(
        { ok: false, error: 'Только ученики могут редактировать профиль.' },
        HttpStatus.FORBIDDEN,
      )
    }
    if (!['studying', 'completed'].includes(student.status)) {
      throw new HttpException(
        { ok: false, error: 'Редактирование профиля недоступно в текущем статусе.' },
        HttpStatus.FORBIDDEN,
      )
    }

    await this.profiles.submitStudentProfileEdit(student.studentId, command)
    try {
      const adminTelegramIds = await this.profiles.recordStudentProfileEditSubmission(
        principal.user.id,
        student.studentId,
        student.fullName,
      )
      const message = `Ученик ${student.fullName} отправил заявку на изменение профиля.`
      for (const telegramId of adminTelegramIds) {
        void this.notifications.send(telegramId, message).catch(() => {})
      }
    } catch {
      // Заявка уже сохранена; вспомогательные уведомления не должны отменять её.
    }
    return { ok: true }
  }
}
