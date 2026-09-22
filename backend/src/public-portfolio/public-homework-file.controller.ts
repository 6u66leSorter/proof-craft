import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import {
  GetPublicHomeworkFileUseCase,
  type PublicFileResponse,
} from './get-public-homework-file.use-case.js'
import { parsePositiveId } from './parse-positive-id.js'

const parsePreview = (value: string | undefined): boolean => {
  if (value == null) return false
  if (value === '1' || value === 'true') return true
  throw new HttpException(
    { ok: false, error: 'Некорректные параметры запроса.' },
    HttpStatus.BAD_REQUEST,
  )
}

@Controller(['api/guest/homeworks', 'guest/homeworks'])
export class PublicHomeworkFileController {
  constructor(
    @Inject(GetPublicHomeworkFileUseCase)
    private readonly getPublicHomeworkFile: GetPublicHomeworkFileUseCase,
  ) {}

  @Get(':id/file')
  async showHomeworkFile(
    @Param('id') homeworkId: string,
    @Query('preview') preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.getPublicHomeworkFile.execute(
      parsePositiveId(homeworkId),
      parsePreview(preview),
    )
    return this.stream(reply, file)
  }

  @Get(':homeworkId/attachments/:attachmentId/file')
  async showAttachmentFile(
    @Param('homeworkId') homeworkId: string,
    @Param('attachmentId') attachmentId: string,
    @Query('preview') preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.getPublicHomeworkFile.executeAttachment(
      parsePositiveId(homeworkId),
      parsePositiveId(attachmentId),
      parsePreview(preview),
    )
    return this.stream(reply, file)
  }

  private stream(
    reply: FastifyReply,
    file: PublicFileResponse,
  ): StreamableFile {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(file.contentType)
    return new StreamableFile(file.stream)
  }
}
