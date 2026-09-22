import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { PublicHomeworkFileRepository } from './public-homework-file.repository.js'

export type PublicFileResponse = {
  stream: Readable
  contentType: string
}

const contentTypeToMime = (contentType: string): string => {
  if (contentType === 'photo') return 'image/jpeg'
  if (contentType === 'video') return 'video/mp4'
  if (contentType === 'document') return 'application/octet-stream'
  return 'text/plain; charset=utf-8'
}

@Injectable()
export class GetPublicHomeworkFileUseCase {
  constructor(
    @Inject(PublicHomeworkFileRepository)
    private readonly homeworks: PublicHomeworkFileRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(homeworkId: number, preview: boolean): Promise<PublicFileResponse> {
    const homework = await this.homeworks.findApprovedHomeworkFile(homeworkId)
    if (!homework) this.throwHomeworkNotFound()
    return await this.openFile(homework.fileId, homework.contentType, preview)
  }

  async executeAttachment(
    homeworkId: number,
    attachmentId: number,
    preview: boolean,
  ): Promise<PublicFileResponse> {
    const attachment = await this.homeworks.findAttachment(homeworkId, attachmentId)
    if (!attachment) {
      throw new HttpException(
        { ok: false, error: 'Вложение не найдено.' },
        HttpStatus.NOT_FOUND,
      )
    }
    if (!attachment.isPublicHomework) this.throwHomeworkNotFound()
    return await this.openFile(attachment.fileId, attachment.contentType, preview)
  }

  private async openFile(
    fileId: string | null,
    contentType: string,
    preview: boolean,
  ): Promise<PublicFileResponse> {
    const file = await this.files.openFile(fileId, {
      imagePreview: preview && contentType === 'photo',
    })
    if (!file) {
      throw new HttpException(
        { ok: false, error: 'Вложение недоступно для скачивания.' },
        HttpStatus.NOT_FOUND,
      )
    }
    return {
      stream: file.stream,
      contentType: file.contentType || contentTypeToMime(contentType),
    }
  }

  private throwHomeworkNotFound(): never {
    throw new HttpException(
      { ok: false, error: 'Работа не найдена.' },
      HttpStatus.NOT_FOUND,
    )
  }
}
