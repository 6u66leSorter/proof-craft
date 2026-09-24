import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import type { ReviewProfileEditCommand } from './profile-edit-review.body.js'
import { ProfilesRepository } from './profiles.repository.js'

@Injectable()
export class ReviewProfileEditUseCase {
  constructor(
    @Inject(ProfilesRepository)
    private readonly profiles: ProfilesRepository,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: ReviewProfileEditCommand,
  ): Promise<{ ok: true }> {
    const admin = requireAdminPrincipal(principal)
    const processed = await this.profiles.reviewProfileEdit(
      command,
      principal.claimedTelegramId,
      sqliteTimestamp(),
    )
    if (!processed) {
      throw new HttpException(
        { ok: false, error: 'Заявка не найдена или уже обработана.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    try {
      await this.profiles.recordProfileEditReview(
        admin.id,
        command.editId,
        command.action,
      )
    } catch {
      // Уже обработанная заявка не отменяется при ошибке вспомогательного аудита.
    }
    return { ok: true }
  }
}
