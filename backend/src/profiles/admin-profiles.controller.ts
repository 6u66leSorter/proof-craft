import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { ListPendingProfileEditsUseCase } from './list-pending-profile-edits.use-case.js'

@Controller(['api/admin', 'admin'])
@UseGuards(AuthenticationGuard)
export class AdminProfilesController {
  constructor(
    @Inject(ListPendingProfileEditsUseCase)
    private readonly listPendingProfileEdits: ListPendingProfileEditsUseCase,
  ) {}

  @Get('profile-edits')
  async listEdits(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<object> {
    return await this.listPendingProfileEdits.execute(principal)
  }
}
