import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { authHttpError } from './auth.errors.js'
import type { AuthenticationRequest } from './auth.types.js'
import { AuthenticationService } from './authentication.service.js'

const parseClaimedTelegramId = (query: unknown): number => {
  const value = (query as { telegram_id?: unknown } | null)?.telegram_id
  const telegramId = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw authHttpError(HttpStatus.BAD_REQUEST, 'Некорректные параметры запроса.')
  }
  return telegramId
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationService) private readonly authentication: AuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticationRequest>()
    const claimedTelegramId = parseClaimedTelegramId(request.query)
    request.authenticatedPrincipal = await this.authentication.authenticate(request, claimedTelegramId)
    return true
  }
}
