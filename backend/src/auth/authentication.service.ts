import crypto from 'node:crypto'
import { HttpStatus, Inject, Injectable } from '@nestjs/common'
import { UserIdentityRepository } from '../persistence/users/user-identity.repository.js'
import { authHttpError } from './auth.errors.js'
import type { AuthenticatedPrincipal, AuthenticationRequest } from './auth.types.js'
import { TelegramInitDataService } from './telegram-init-data.service.js'
import { VkLaunchParamsService } from './vk-launch-params.service.js'

const singleHeader = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')

const sqliteNow = (): string => new Date().toISOString().slice(0, 19).replace('T', ' ')

@Injectable()
export class AuthenticationService {
  constructor(
    @Inject(UserIdentityRepository) private readonly users: UserIdentityRepository,
    @Inject(TelegramInitDataService) private readonly telegramInitData: TelegramInitDataService,
    @Inject(VkLaunchParamsService) private readonly vkLaunchParams: VkLaunchParamsService,
  ) {}

  async authenticate(
    request: AuthenticationRequest,
    claimedTelegramId: number,
  ): Promise<AuthenticatedPrincipal> {
    const webSession = singleHeader(request.headers['x-web-session']).trim()
    if (webSession) return await this.authenticateWebSession(webSession, claimedTelegramId)

    const clientPlatform = singleHeader(request.headers['x-client-platform']).toLowerCase()
    if (clientPlatform === 'vk') return await this.authenticateVk(request, claimedTelegramId)

    return await this.authenticateTelegram(request, claimedTelegramId)
  }

  private async authenticateWebSession(
    token: string,
    claimedTelegramId: number,
  ): Promise<AuthenticatedPrincipal> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const now = sqliteNow()
    const user = await this.users.findByWebSessionTokenHash(tokenHash, now)
    if (!user) {
      throw authHttpError(HttpStatus.UNAUTHORIZED, 'Сессия сайта истекла. Войдите снова.')
    }
    if (user.telegramId !== claimedTelegramId) {
      throw authHttpError(
        HttpStatus.FORBIDDEN,
        'Сессия сайта не соответствует запрошенному пользователю.',
      )
    }
    await this.users.touchWebSession(tokenHash, now)
    return { provider: 'web-session', claimedTelegramId, user }
  }

  private async authenticateVk(
    request: AuthenticationRequest,
    claimedTelegramId: number,
  ): Promise<AuthenticatedPrincipal> {
    const vkUserId = Number(singleHeader(request.headers['x-vk-user-id']))
    if (!Number.isSafeInteger(vkUserId) || vkUserId <= 0) {
      throw authHttpError(HttpStatus.UNAUTHORIZED, 'Некорректный X-VK-User-Id.')
    }

    const offset = Number(process.env.VK_ID_OFFSET || 10_000_000_000)
    const mappedAppUserId = offset + vkUserId
    const appUserId = Number(singleHeader(request.headers['x-app-user-id']) || 0)
    if (appUserId && appUserId !== mappedAppUserId) {
      throw authHttpError(HttpStatus.FORBIDDEN, 'X-App-User-Id не совпадает с VK user id.')
    }
    if (claimedTelegramId !== mappedAppUserId) {
      throw authHttpError(HttpStatus.FORBIDDEN, 'telegram_id не совпадает с VK user id.')
    }

    const launchParams = singleHeader(request.headers['x-vk-launch-params'])
    if (launchParams) {
      const launchAppId = Number(new URLSearchParams(launchParams).get('vk_app_id') || 0)
      const configuredAppId = Number(process.env.VK_APP_ID || 54_558_405)
      if (launchAppId && launchAppId !== configuredAppId) {
        throw authHttpError(
          HttpStatus.FORBIDDEN,
          'vk_app_id не совпадает с конфигурацией сервера.',
        )
      }
    }

    const appSecret = process.env.VK_APP_SECRET || ''
    if (!appSecret) {
      throw authHttpError(
        HttpStatus.SERVICE_UNAVAILABLE,
        'VK авторизация не настроена на сервере.',
      )
    }
    if (!this.vkLaunchParams.verify(launchParams, appSecret)) {
      throw authHttpError(HttpStatus.UNAUTHORIZED, 'Недействительная подпись VK launch params.')
    }

    const user =
      (await this.users.findByVkUserId(vkUserId)) ??
      (await this.users.findByTelegramId(claimedTelegramId))
    return { provider: 'vk', claimedTelegramId, user }
  }

  private async authenticateTelegram(
    request: AuthenticationRequest,
    claimedTelegramId: number,
  ): Promise<AuthenticatedPrincipal> {
    const botToken =
      process.env.BOT_TOKEN ||
      process.env.TELEGRAM_BOT_TOKEN ||
      process.env.VITE_TELEGRAM_BOT_TOKEN ||
      ''
    const rawMode = String(process.env.TG_WEBAPP_AUTH || '').toLowerCase()
    const mode = ['off', 'optional', 'strict'].includes(rawMode)
      ? rawMode
      : botToken
        ? 'optional'
        : 'off'
    const rawInitData = singleHeader(request.headers['x-telegram-init-data'])

    if (mode !== 'off' && botToken) {
      if (!rawInitData) {
        if (mode === 'strict') {
          throw authHttpError(
            HttpStatus.UNAUTHORIZED,
            'Требуется заголовок X-Telegram-Init-Data. Откройте мини-апп из Telegram или задайте TG_WEBAPP_AUTH=optional для разработки.',
          )
        }
      } else {
        const maxAgeSeconds = Number(process.env.TG_INIT_DATA_MAX_AGE_SEC || 86_400)
        const signedTelegramId = this.telegramInitData.parseAndValidate(
          rawInitData.trim(),
          botToken,
          maxAgeSeconds,
        )
        if (signedTelegramId == null) {
          throw authHttpError(
            HttpStatus.UNAUTHORIZED,
            'Недействительные или устаревшие данные Telegram (initData).',
          )
        }
        if (signedTelegramId !== claimedTelegramId) {
          throw authHttpError(
            HttpStatus.FORBIDDEN,
            'telegram_id не совпадает с подписью Telegram.',
          )
        }
      }
    }

    const user = await this.users.findByTelegramId(claimedTelegramId)
    return { provider: 'telegram', claimedTelegramId, user }
  }
}
