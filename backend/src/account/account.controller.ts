import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'
import {
  VkLinkConfirmBodyGuard,
  VkLinkTokenPlatformGuard,
  vkUserIdFromRequest,
  type VkLinkConfirmRequest,
} from './vk-link.guards.js'
import { VkLinkUseCases } from './vk-link.use-cases.js'

@Controller(['api/account', 'account'])
export class AccountController {
  constructor(@Inject(VkLinkUseCases) private readonly vkLink: VkLinkUseCases) {}

  @Post('vk-link-token')
  @HttpCode(HttpStatus.OK)
  @UseGuards(VkLinkTokenPlatformGuard, AuthenticationGuard)
  async issueToken(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<object> {
    return await this.vkLink.issueToken(principal)
  }

  @Post('vk-link-confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(VkLinkConfirmBodyGuard, AuthenticationGuard)
  async confirm(@Req() request: VkLinkConfirmRequest): Promise<object> {
    return await this.vkLink.confirm(vkUserIdFromRequest(request), request.vkLinkCode ?? invalidParameters())
  }
}
