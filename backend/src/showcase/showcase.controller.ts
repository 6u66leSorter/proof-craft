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
import { invalidParameters } from '../common/invalid-parameters.error.js'
import { parseBoundedIntegerQuery } from '../common/parse-bounded-integer-query.js'
import { parsePositiveId } from '../common/parse-positive-id.js'
import { GetShowcaseHomeworkFileUseCase } from './get-showcase-homework-file.use-case.js'
import { ListShowcaseHomeworksUseCase } from './list-showcase-homeworks.use-case.js'

const parseLimit = (value: unknown): number => {
  return parseBoundedIntegerQuery(value, { defaultValue: 3, min: 1, max: 12 })
}

const parseExcludedIds = (value: unknown): Set<number> => {
  if (value == null) return new Set()
  if (typeof value !== 'string') return invalidParameters()
  return new Set(
    value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  )
}

@Controller(['api/showcase/homeworks', 'showcase/homeworks'])
@UseGuards(AuthenticationGuard)
export class ShowcaseController {
  constructor(
    @Inject(ListShowcaseHomeworksUseCase)
    private readonly listShowcaseHomeworks: ListShowcaseHomeworksUseCase,
    @Inject(GetShowcaseHomeworkFileUseCase)
    private readonly getShowcaseHomeworkFile: GetShowcaseHomeworkFileUseCase,
  ) {}

  @Get()
  async list(
    @Query('limit') limit: unknown,
    @Query('exclude_ids') excludedIds: unknown,
  ): Promise<object> {
    return await this.listShowcaseHomeworks.execute(
      parseLimit(limit),
      parseExcludedIds(excludedIds),
    )
  }

  @Get(':id/file')
  async showFile(
    @Param('id') homeworkId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.getShowcaseHomeworkFile.execute(parsePositiveId(homeworkId))
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(file.contentType)
    return new StreamableFile(file.stream)
  }
}
