import { Controller, Inject, Patch, Req, UseGuards } from '@nestjs/common'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { EditPendingHomeworkUseCase } from './edit-pending-homework.use-case.js'
import { HomeworkEditGuard } from './homework-edit.guard.js'
import { homeworkEditFrom, type HomeworkEditRequest } from './homework-edit.request.js'
import { HomeworkSubmissionStorage } from './homework-submission.storage.js'

@Controller(['api/student/homeworks', 'student/homeworks'])
export class HomeworkEditController {
  constructor(
    @Inject(EditPendingHomeworkUseCase) private readonly editHomework: EditPendingHomeworkUseCase,
    @Inject(HomeworkSubmissionStorage) private readonly storage: HomeworkSubmissionStorage,
  ) {}

  @Patch(':homeworkId')
  @UseGuards(HomeworkEditGuard)
  async edit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: HomeworkEditRequest,
  ): Promise<object> {
    const command = homeworkEditFrom(request)
    try {
      return await this.editHomework.execute(principal, command)
    } finally {
      await Promise.all(command.files.map((file) => this.storage.discard(file.path)))
    }
  }
}
