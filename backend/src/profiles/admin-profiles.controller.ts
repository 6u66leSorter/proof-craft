import { Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { ListPendingProfileEditsUseCase } from './list-pending-profile-edits.use-case.js'
import {
  profileEditReviewCommandFrom,
  type ProfileEditReviewRequest,
} from './profile-edit-review.body.js'
import { ProfileEditReviewGuard } from './profile-edit-review.guard.js'
import { ReviewProfileEditUseCase } from './review-profile-edit.use-case.js'

@Controller(['api/admin', 'admin'])
export class AdminProfilesController {
  constructor(
    @Inject(ListPendingProfileEditsUseCase)
    private readonly listPendingProfileEdits: ListPendingProfileEditsUseCase,
    @Inject(ReviewProfileEditUseCase)
    private readonly reviewProfileEdit: ReviewProfileEditUseCase,
  ) {}

  @Get('profile-edits')
  @UseGuards(AuthenticationGuard)
  async listEdits(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<object> {
    return await this.listPendingProfileEdits.execute(principal)
  }

  @Post('profile-edits/:id')
  @HttpCode(200)
  @UseGuards(ProfileEditReviewGuard, AuthenticationGuard)
  async reviewEdit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: ProfileEditReviewRequest,
  ): Promise<{ ok: true }> {
    return await this.reviewProfileEdit.execute(
      principal,
      profileEditReviewCommandFrom(request),
    )
  }
}
