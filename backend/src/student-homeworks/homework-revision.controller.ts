import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { HomeworkSubmissionStorage } from './homework-submission.storage.js'
import { HomeworkRevisionGuard } from './homework-revision.guard.js'
import { homeworkRevisionFrom, type HomeworkRevisionRequest } from './homework-revision.request.js'
import { SubmitHomeworkRevisionUseCase } from './submit-homework-revision.use-case.js'

@Controller(['api/student/homeworks', 'student/homeworks'])
export class HomeworkRevisionController {
  constructor(
    @Inject(SubmitHomeworkRevisionUseCase) private readonly submitRevision: SubmitHomeworkRevisionUseCase,
    @Inject(HomeworkSubmissionStorage) private readonly storage: HomeworkSubmissionStorage,
  ) {}

  @Post(':homeworkId/revision')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HomeworkRevisionGuard)
  async submit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: HomeworkRevisionRequest,
  ): Promise<object> {
    const command = homeworkRevisionFrom(request)
    try {
      return await this.submitRevision.execute(principal, command)
    } finally {
      // Промежуточный файл после finalize уже не нужен; при ошибке до finalize — тем более.
      await this.storage.discard(command.file?.path ?? null)
    }
  }
}
