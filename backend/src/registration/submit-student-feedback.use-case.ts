import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { RegistrationRepository } from './registration.repository.js'
import type { SubmitStudentFeedbackCommand } from './student-feedback.body.js'

@Injectable()
export class SubmitStudentFeedbackUseCase {
  constructor(
    @Inject(RegistrationRepository)
    private readonly registrations: RegistrationRepository,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: SubmitStudentFeedbackCommand,
  ): Promise<{ ok: true }> {
    const saved = principal.user
      ? await this.registrations.saveStudentFeedback(
          principal.user.id,
          command.requestKey,
          command.subject,
          command.message,
          sqliteTimestamp(),
        )
      : false
    if (!saved) {
      throw new HttpException(
        { ok: false, error: 'Обратная связь доступна только ученику.' },
        HttpStatus.FORBIDDEN,
      )
    }
    return { ok: true }
  }
}
