import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { contentTypeToMime } from '../storage/content-type-to-mime.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import {
  HomeworkFileRepository,
  type HomeworkFileAccess,
} from './homework-file.repository.js'

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
    this.assertAccess(principal, access)
    return await this.openFile(
      access.fileId,
      preview && access.contentType === 'photo',
      contentTypeToMime(access.contentType),
    )
  }

  async executeRevision(
    principal: AuthenticatedPrincipal,
    homeworkId: number,
    preview: boolean,
  ): Promise<HomeworkFileResponse> {
    const access = await this.homeworks.findAccess(homeworkId, principal.user?.id ?? null)
    if (!access?.revisionFileId) {
      throw new HttpException(
        { ok: false, error: 'Файл исправления не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    this.assertAccess(principal, access)
    return await this.openFile(access.revisionFileId, preview, 'image/jpeg')
  }

  private async openFile(
    fileId: string | null,
    imagePreview: boolean,
    fallbackContentType: string,
  ): Promise<HomeworkFileResponse> {
    const file = await this.files.openFile(fileId, { imagePreview })
    if (!file) {
      throw new HttpException(
        { ok: false, error: 'Вложение недоступно для скачивания.' },
        HttpStatus.NOT_FOUND,
      )
    }
    return {
      stream: file.stream,
      contentType: file.contentType || fallbackContentType,
    }
  }

  private assertAccess(
    principal: AuthenticatedPrincipal,
    access: HomeworkFileAccess,
  ): void {
    const isAdmin = principal.user?.roles.includes('admin') ?? false
    if (isAdmin || access.isOwner || access.isAssignedTeacher) return
    throw new HttpException(
      { ok: false, error: 'Нет доступа к этому файлу.' },
      HttpStatus.FORBIDDEN,
    )
  }
}
