import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import type { UpdateAboutCommand } from './about.body.js'
import { ProfilesRepository } from './profiles.repository.js'

const teacherOnlyError = (): HttpException =>
  new HttpException(
    { ok: false, error: 'Только преподаватель может изменить раздел «Обо мне».' },
    HttpStatus.FORBIDDEN,
  )

@Injectable()
export class UpdateTeacherAboutUseCase {
  constructor(
    @Inject(ProfilesRepository)
    private readonly profiles: ProfilesRepository,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: UpdateAboutCommand,
  ): Promise<{ ok: true }> {
    if (!principal.user?.roles.includes('teacher')) throw teacherOnlyError()
    const updated = await this.profiles.updateTeacherAbout(
      principal.user.id,
      command.aboutMe,
      sqliteTimestamp(),
    )
    if (!updated) throw teacherOnlyError()
    return { ok: true }
  }
}
