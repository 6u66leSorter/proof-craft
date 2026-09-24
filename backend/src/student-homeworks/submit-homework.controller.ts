import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { HomeworkSubmissionStorage } from './homework-submission.storage.js'
import { SubmitHomeworkGuard } from './submit-homework.guard.js'
import {
  homeworkSubmissionFrom,
  type SubmitHomeworkRequest,
} from './submit-homework.request.js'
import { SubmitHomeworkUseCase } from './submit-homework.use-case.js'

@Controller(['api/homeworks', 'homeworks'])
export class SubmitHomeworkController {
  constructor(
    @Inject(SubmitHomeworkUseCase)
    private readonly submitHomework: SubmitHomeworkUseCase,
    @Inject(HomeworkSubmissionStorage)
    private readonly storage: HomeworkSubmissionStorage,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SubmitHomeworkGuard)
  async submit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: SubmitHomeworkRequest,
  ): Promise<object> {
    const command = homeworkSubmissionFrom(request)
    try {
      return await this.submitHomework.execute(principal, command)
    } finally {
      await Promise.all(command.files.map((file) => this.storage.discard(file.path)))
    }
  }
}
