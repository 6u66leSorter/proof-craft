import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { parsePreviewQuery } from '../common/parse-preview-query.js'
import { parsePositiveId } from '../common/parse-positive-id.js'
import {
  GetPublicHomeworkFileUseCase,
  type PublicFileResponse,
} from './get-public-homework-file.use-case.js'

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
      parsePreviewQuery(preview),
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
      parsePreviewQuery(preview),
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
