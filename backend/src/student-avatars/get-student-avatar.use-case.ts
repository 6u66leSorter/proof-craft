import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
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

  async executeOwn(principal: AuthenticatedPrincipal): Promise<Readable> {
    if (!principal.user) {
      throw new HttpException(
        { ok: false, error: 'Пользователь не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const avatar = await this.avatars.findByUserId(principal.user.id)
    return this.openAvatar(avatar?.avatarFileId ?? null)
  }

  async executeForStudent(
    principal: AuthenticatedPrincipal,
    studentId: number,
  ): Promise<Readable> {
    const access = await this.avatars.findAccess(studentId, principal.user?.id ?? null)
    const isAdmin = principal.user?.roles.includes('admin') ?? false
    if (!isAdmin && !access?.isOwner && !access?.isAssignedTeacher) {
      throw new HttpException(
        { ok: false, error: 'Нет доступа к профилю ученика.' },
        HttpStatus.FORBIDDEN,
      )
    }
    return this.openAvatar(access?.avatarFileId ?? null)
  }

  private openAvatar(avatarFileId: string | null): Readable {
    if (!avatarFileId) {
      throw new HttpException(
        { ok: false, error: 'Аватар не установлен.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const stream = this.files.openLocalFile(avatarFileId)
    if (!stream) {
      throw new HttpException(
        { ok: false, error: 'Файл аватара не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    return stream
  }
}
