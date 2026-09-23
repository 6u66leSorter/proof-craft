import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { contentTypeToMime } from '../storage/content-type-to-mime.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { HomeworkFileRepository } from './homework-file.repository.js'

export type HomeworkFileResponse = {
  stream: Readable
  contentType: string
}

@Injectable()
export class GetHomeworkFileUseCase {
  constructor(
    @Inject(HomeworkFileRepository)
    private readonly homeworks: HomeworkFileRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    homeworkId: number,
    preview: boolean,
  ): Promise<HomeworkFileResponse> {
    const access = await this.homeworks.findAccess(homeworkId, principal.user?.id ?? null)
    if (!access) {
      throw new HttpException(
        { ok: false, error: 'Задание не найдено.' },
        HttpStatus.NOT_FOUND,
      )
    }
    const isAdmin = principal.user?.roles.includes('admin') ?? false
    if (!isAdmin && !access.isOwner && !access.isAssignedTeacher) {
      throw new HttpException(
        { ok: false, error: 'Нет доступа к этому файлу.' },
        HttpStatus.FORBIDDEN,
      )
    }

    const file = await this.files.openFile(access.fileId, {
      imagePreview: preview && access.contentType === 'photo',
    })
    if (!file) {
      throw new HttpException(
        { ok: false, error: 'Вложение недоступно для скачивания.' },
        HttpStatus.NOT_FOUND,
      )
    }
    return {
      stream: file.stream,
      contentType: file.contentType || contentTypeToMime(access.contentType),
    }
  }
}
