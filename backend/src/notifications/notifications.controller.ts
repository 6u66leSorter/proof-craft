import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { parseBoundedIntegerQuery } from '../common/parse-bounded-integer-query.js'
import { ListNotificationsUseCase } from './list-notifications.use-case.js'

@Controller(['api/notifications', 'notifications'])
export class NotificationsController {
  constructor(
    @Inject(ListNotificationsUseCase)
    private readonly listNotifications: ListNotificationsUseCase,
  ) {}

  @Get()
  @UseGuards(AuthenticationGuard)
  async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query('limit') limit: unknown,
  ): Promise<object> {
    return await this.listNotifications.execute(
      principal,
      parseBoundedIntegerQuery(limit, { defaultValue: 40, min: 1, max: 80 }),
    )
  }
}
