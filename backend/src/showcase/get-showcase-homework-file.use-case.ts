import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { contentTypeToMime } from '../storage/content-type-to-mime.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { ShowcaseRepository } from './showcase.repository.js'

type ShowcaseFileResponse = {
  stream: Readable
  contentType: string
}

@Injectable()
export class GetShowcaseHomeworkFileUseCase {
  constructor(
    @Inject(ShowcaseRepository)
    private readonly showcase: ShowcaseRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(homeworkId: number): Promise<ShowcaseFileResponse> {
    const homework = await this.showcase.findHomeworkFile(homeworkId)
    if (!homework || homework.status !== 'approved') {
      throw new HttpException(
        { ok: false, error: 'Работа не найдена.' },
        HttpStatus.NOT_FOUND,
      )
    }
    if (homework.contentType !== 'photo' && homework.contentType !== 'video') {
      throw new HttpException(
        { ok: false, error: 'Файл для предпросмотра недоступен.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const file = await this.files.openFile(homework.fileId)
    if (!file) {
      throw new HttpException(
        { ok: false, error: 'Вложение недоступно для скачивания.' },
        HttpStatus.NOT_FOUND,
      )
    }
    return {
      stream: file.stream,
      contentType: file.contentType || contentTypeToMime(homework.contentType),
    }
  }
}
