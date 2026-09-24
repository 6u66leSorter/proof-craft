import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { AddHomeworkCommentUseCase } from './add-homework-comment.use-case.js'
import { homeworkCommentCommandFrom, type HomeworkCommentRequest } from './homework-comment.body.js'
import { HomeworkCommentGuard } from './homework-comment.guard.js'

@Controller(['api/homeworks', 'homeworks'])
export class HomeworkCommentsController {
  constructor(@Inject(AddHomeworkCommentUseCase) private readonly addComment: AddHomeworkCommentUseCase) {}

  @Post(':id/comments')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HomeworkCommentGuard, AuthenticationGuard)
  async add(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: HomeworkCommentRequest,
  ): Promise<{ ok: true }> {
    return await this.addComment.execute(principal, homeworkCommentCommandFrom(request))
  }
}
