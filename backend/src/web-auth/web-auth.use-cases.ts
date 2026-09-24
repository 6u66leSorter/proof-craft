import crypto from 'node:crypto'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { VkLaunchParamsService } from '../auth/vk-launch-params.service.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { UserIdentityRepository } from '../persistence/users/user-identity.repository.js'
import { WebAuthRepository, type WebLoginProvider } from './web-auth.repository.js'

const LOGIN_TTL_MINUTES = 15
const SESSION_TTL_DAYS = 14
const MINUTE = 60_000

const fail = (status: HttpStatus, error: string): HttpException => new HttpException({ ok: false, error }, status)
const hash = (token: string): string => crypto.createHash('sha256').update(token, 'utf8').digest('hex')
const newOpaqueToken = (): string => crypto.randomBytes(32).toString('base64url')

export type VkConfirmation = {
  token: string
  clientPlatform: string
  vkUserIdHeader: string
  launchParams: string
}

/**
 * Вход на обычный сайт через подтверждение в Telegram или VK (legacy `/api/web-auth/*`).
 * Подтверждение из Telegram по-прежнему пишет бот; здесь — запуск, опрос, подтверждение из VK,
 * выход и проверка web-сессии. В БД хранятся только SHA-256 хэши токенов.
 */
@Injectable()
export class WebAuthUseCases {
  constructor(
    @Inject(WebAuthRepository) private readonly webAuth: WebAuthRepository,
    @Inject(UserIdentityRepository) private readonly users: UserIdentityRepository,
    @Inject(VkLaunchParamsService) private readonly vkLaunchParams: VkLaunchParamsService,
  ) {}

  async start(rawBody: unknown): Promise<object> {
    const provider = (rawBody as { provider?: unknown } | null)?.provider
    if (provider !== 'telegram' && provider !== 'vk') return invalidParameters()
    const botUsername = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim()
    const vkAppId = Number(process.env.VK_APP_ID || 54_558_405)
    if (provider === 'telegram' && !botUsername) {
      throw fail(HttpStatus.SERVICE_UNAVAILABLE, 'Вход через Telegram ещё не настроен на сервере.')
    }
    if (provider === 'vk' && (!vkAppId || !process.env.VK_APP_SECRET)) {
      throw fail(HttpStatus.SERVICE_UNAVAILABLE, 'Вход через VK ещё не настроен на сервере.')
    }
    const token = newOpaqueToken()
    const now = Date.now()
    await this.webAuth.createLoginRequest(
      provider as WebLoginProvider,
      hash(token),
      sqliteTimestamp(now + LOGIN_TTL_MINUTES * MINUTE),
      sqliteTimestamp(now),
    )
    const handoffUrl =
      provider === 'telegram'
        ? `https://t.me/${encodeURIComponent(botUsername)}?start=webauth_${token}`
        : `https://vk.com/app${vkAppId}?web_login=${encodeURIComponent(token)}`
    return { ok: true, data: { token, handoff_url: handoffUrl, expires_in_seconds: LOGIN_TTL_MINUTES * 60 } }
  }

  async status(rawToken: unknown): Promise<object> {
    if (typeof rawToken !== 'string' || rawToken.length < 20 || rawToken.length > 200) return invalidParameters()
    const tokenHash = hash(rawToken.trim())
    const now = Date.now()
    const state = await this.webAuth.getLoginState(tokenHash, sqliteTimestamp(now))
    if (state === 'pending') return { ok: true, data: { status: 'pending' } }
    if (state === 'expired') throw fail(HttpStatus.GONE, 'Время подтверждения входа истекло. Начните заново.')
    const sessionToken = newOpaqueToken()
    const session = await this.webAuth.consumeLoginRequest(
      tokenHash,
      hash(sessionToken),
      sqliteTimestamp(now + SESSION_TTL_DAYS * 24 * 60 * MINUTE),
      sqliteTimestamp(now),
    )
    if (!session) throw fail(HttpStatus.CONFLICT, 'Вход уже завершён в другой вкладке.')
    return { ok: true, data: { status: 'approved', session_token: sessionToken, telegram_id: session.telegramId } }
  }

  /**
   * Исправление SEC-005: legacy брал VK-пользователя из заголовка X-VK-User-Id, не сверяя его
   * с подписанными launch params. Здесь идентификатор обязан совпадать с подписанным `vk_user_id`.
   */
  async confirmVk(input: VkConfirmation): Promise<object> {
    const token = input.token.trim()
    const headerVkUserId = input.clientPlatform.toLowerCase() === 'vk' ? Number(input.vkUserIdHeader) : NaN
    const appSecret = process.env.VK_APP_SECRET || ''
    const signedVkUserId = Number(new URLSearchParams(input.launchParams).get('vk_user_id'))
    if (
      !token ||
      !Number.isSafeInteger(headerVkUserId) ||
      headerVkUserId <= 0 ||
      !appSecret ||
      !this.vkLaunchParams.verify(input.launchParams, appSecret) ||
      signedVkUserId !== headerVkUserId
    ) {
      throw fail(HttpStatus.UNAUTHORIZED, 'Не удалось подтвердить вход через VK.')
    }
    const now = sqliteTimestamp()
    const offset = Number(process.env.VK_ID_OFFSET || 10_000_000_000)
    const userId = await this.webAuth.findOrCreateVkUser(headerVkUserId, offset + headerVkUserId, now)
    if (!(await this.webAuth.approveLoginRequest(hash(token), 'vk', userId, now))) {
      throw fail(HttpStatus.GONE, 'Ссылка для входа недействительна или уже использована.')
    }
    await this.webAuth.appendAudit(userId, 'web_login_approved', { provider: 'vk' }, now)
    return { ok: true, data: { approved: true } }
  }

  async logout(sessionToken: string): Promise<{ ok: true }> {
    const token = sessionToken.trim()
    if (token) await this.webAuth.deleteSession(hash(token))
    return { ok: true }
  }

  async session(sessionToken: string): Promise<object> {
    const tokenHash = hash(sessionToken.trim())
    const now = sqliteTimestamp()
    const user = await this.users.findByWebSessionTokenHash(tokenHash, now)
    if (!user) throw fail(HttpStatus.UNAUTHORIZED, 'Сессия сайта истекла. Войдите снова.')
    await this.users.touchWebSession(tokenHash, now)
    return { ok: true, data: { telegram_id: user.telegramId } }
  }
}
