import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  AvatarImageProcessingError,
  AvatarFileTooLargeError,
  StudentAvatarStorage,
} from './student-avatar-storage.js'
import {
  StudentAvatarRepository,
  type StudentAvatar,
} from './student-avatar.repository.js'

@Injectable()
export class UploadStudentAvatarUseCase {
  constructor(
    @Inject(StudentAvatarRepository)
    private readonly avatars: StudentAvatarRepository,
    @Inject(StudentAvatarStorage)
    private readonly storage: StudentAvatarStorage,
  ) {}

  async resolveTarget(principal: AuthenticatedPrincipal): Promise<StudentAvatar> {
    if (!principal.user) {
      throw new HttpException(
        { ok: false, error: 'Пользователь не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    const student = await this.avatars.findByUserId(principal.user.id)
    if (!student) {
      throw new HttpException(
        { ok: false, error: 'Только ученики могут менять аватар.' },
        HttpStatus.FORBIDDEN,
      )
    }
    return student
  }

  async replace(
    target: StudentAvatar,
    source: Readable,
    isTruncated: () => boolean,
  ): Promise<void> {
    let newAvatarFileId: string
    try {
      newAvatarFileId = await this.storage.saveAvatar(source, target.studentId)
    } catch (error) {
      if (isTruncated()) throw new AvatarFileTooLargeError()
      if (error instanceof AvatarImageProcessingError) {
        throw this.processingError()
      }
      throw error
    }

    if (isTruncated()) {
      await this.storage.deleteAvatar(newAvatarFileId)
      throw new AvatarFileTooLargeError()
    }

    try {
      await this.avatars.updateAvatar(target.studentId, newAvatarFileId)
    } catch {
      await this.storage.deleteAvatar(newAvatarFileId)
      throw this.processingError()
    }
    await this.storage.deleteAvatar(target.avatarFileId)
  }

  private processingError(): HttpException {
    return new HttpException(
      { ok: false, error: 'Ошибка обработки изображения.' },
      HttpStatus.INTERNAL_SERVER_ERROR,
    )
  }
}
