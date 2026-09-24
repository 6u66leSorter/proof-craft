import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common'
import { WebAuthUseCases } from './web-auth.use-cases.js'

const header = (value: string | string[] | undefined): string => (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''))

@Controller(['api/web-auth', 'web-auth'])
export class WebAuthController {
  constructor(@Inject(WebAuthUseCases) private readonly webAuth: WebAuthUseCases) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  async start(@Body() body: unknown): Promise<object> {
    return await this.webAuth.start(body)
  }

  @Get('status')
  async status(@Query('token') token: unknown): Promise<object> {
    return await this.webAuth.status(token)
  }

  @Post('confirm/vk')
  @HttpCode(HttpStatus.OK)
  async confirmVk(
    @Query('token') token: unknown,
    @Headers('x-client-platform') clientPlatform: string | string[] | undefined,
    @Headers('x-vk-user-id') vkUserId: string | string[] | undefined,
    @Headers('x-vk-launch-params') launchParams: string | string[] | undefined,
  ): Promise<object> {
    return await this.webAuth.confirmVk({
      token: typeof token === 'string' ? token : '',
      clientPlatform: header(clientPlatform),
      vkUserIdHeader: header(vkUserId),
      launchParams: header(launchParams),
    })
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('x-web-session') sessionToken: string | string[] | undefined): Promise<{ ok: true }> {
    return await this.webAuth.logout(header(sessionToken))
  }

  @Get('session')
  async session(@Headers('x-web-session') sessionToken: string | string[] | undefined): Promise<object> {
    return await this.webAuth.session(header(sessionToken))
  }
}
