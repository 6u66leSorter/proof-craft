import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import type { UpdateStudentAboutCommand } from './student-about.body.js'
import { StudentProfileRepository } from './student-profile.repository.js'

const studentOnlyError = (): HttpException =>
  new HttpException(
    { ok: false, error: 'Только ученик может изменить раздел «Обо мне».' },
    HttpStatus.FORBIDDEN,
  )

@Injectable()
export class UpdateStudentAboutUseCase {
  constructor(
    @Inject(StudentProfileRepository)
    private readonly students: StudentProfileRepository,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: UpdateStudentAboutCommand,
  ): Promise<{ ok: true }> {
    if (!principal.user) throw studentOnlyError()
    const updated = await this.students.updateAbout(
      principal.user.id,
      command.aboutMe,
      sqliteTimestamp(),
    )
    if (!updated) throw studentOnlyError()
    return { ok: true }
  }
}
