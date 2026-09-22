import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { parseBoundedIntegerQuery } from '../common/parse-bounded-integer-query.js'
import { ListNotificationsUseCase } from './list-notifications.use-case.js'
import { MarkNotificationsReadUseCase } from './mark-notifications-read.use-case.js'
import { parseMarkNotificationsReadBody } from './mark-notifications-read.body.js'

@Controller(['api/notifications', 'notifications'])
export class NotificationsController {
  constructor(
    @Inject(ListNotificationsUseCase)
    private readonly listNotifications: ListNotificationsUseCase,
    @Inject(MarkNotificationsReadUseCase)
    private readonly markNotificationsRead: MarkNotificationsReadUseCase,
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

  @Post('read')
  @HttpCode(200)
  @UseGuards(AuthenticationGuard)
  async markRead(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: unknown,
  ): Promise<object> {
    return await this.markNotificationsRead.execute(
      principal,
      parseMarkNotificationsReadBody(body),
    )
  }
}
