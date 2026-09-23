import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import type { UpdateAboutCommand } from './about.body.js'
import { ProfilesRepository } from './profiles.repository.js'

const studentOnlyError = (): HttpException =>
  new HttpException(
    { ok: false, error: 'Только ученик может изменить раздел «Обо мне».' },
    HttpStatus.FORBIDDEN,
  )

@Injectable()
export class UpdateStudentAboutUseCase {
  constructor(
    @Inject(ProfilesRepository)
    private readonly profiles: ProfilesRepository,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: UpdateAboutCommand,
  ): Promise<{ ok: true }> {
    if (!principal.user) throw studentOnlyError()
    const updated = await this.profiles.updateStudentAbout(
      principal.user.id,
      command.aboutMe,
      sqliteTimestamp(),
    )
    if (!updated) throw studentOnlyError()
    return { ok: true }
  }
}
