import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { StudentAvatarRepository } from './student-avatar.repository.js'

@Injectable()
export class GetOwnStudentAvatarUseCase {
  constructor(
    @Inject(StudentAvatarRepository)
    private readonly avatars: StudentAvatarRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(principal: AuthenticatedPrincipal): Promise<Readable> {
    if (!principal.user) {
      throw new HttpException(
        { ok: false, error: 'Пользователь не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const avatar = await this.avatars.findByUserId(principal.user.id)
    if (!avatar?.avatarFileId) {
      throw new HttpException(
        { ok: false, error: 'Аватар не установлен.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const stream = this.files.openLocalFile(avatar.avatarFileId)
    if (!stream) {
      throw new HttpException(
        { ok: false, error: 'Файл аватара не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    return stream
  }
}
