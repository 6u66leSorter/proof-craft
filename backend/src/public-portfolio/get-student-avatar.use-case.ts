import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { StudentAvatarRepository } from './student-avatar.repository.js'

@Injectable()
export class GetStudentAvatarUseCase {
  constructor(
    @Inject(StudentAvatarRepository)
    private readonly avatars: StudentAvatarRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(studentId: number): Promise<Readable> {
    const avatar = await this.avatars.findVisibleStudentAvatar(studentId)
    if (!avatar) {
      throw new HttpException(
        { ok: false, error: 'Профиль недоступен.' },
        HttpStatus.NOT_FOUND,
      )
    }
    if (!avatar.avatarFileId) {
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
