import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { parsePositiveId } from '../common/parse-positive-id.js'
import { parsePreviewQuery } from '../common/parse-preview-query.js'
import { GetHomeworkFileUseCase } from './get-homework-file.use-case.js'

@Controller(['api/homeworks', 'homeworks'])
@UseGuards(AuthenticationGuard)
export class HomeworkFilesController {
  constructor(
    @Inject(GetHomeworkFileUseCase)
    private readonly getHomeworkFile: GetHomeworkFileUseCase,
  ) {}

  @Get(':id/file')
  async showPrimaryFile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id') homeworkId: string,
    @Query('preview') preview: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.getHomeworkFile.execute(
      principal,
      parsePositiveId(homeworkId),
      parsePreviewQuery(preview),
    )
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(file.contentType)
    return new StreamableFile(file.stream)
  }
}
