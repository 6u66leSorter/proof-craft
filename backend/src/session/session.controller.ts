import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { GetSessionUseCase } from './get-session.use-case.js'

@Controller(['api/session', 'session'])
export class SessionController {
  constructor(@Inject(GetSessionUseCase) private readonly getSession: GetSessionUseCase) {}

  @Get()
  @UseGuards(AuthenticationGuard)
  async show(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<object> {
    return await this.getSession.execute(principal)
  }
}
