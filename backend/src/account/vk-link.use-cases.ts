import crypto from 'node:crypto'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { VkLinkRepository } from './vk-link.repository.js'

const TOKEN_TTL_MINUTES = 15
const fail = (status: HttpStatus, error: string): HttpException => new HttpException({ ok: false, error }, status)
const hash = (token: string): string => crypto.createHash('sha256').update(token, 'utf8').digest('hex')

/**
 * Связь Telegram- и VK-аккаунтов: в Telegram выдаётся
 * четырёхзначный код, в VK он подтверждается. Длина кода сохранена для совместимости клиентов и бота;
 * ограничение попыток — отдельное решение SEC-004.
 */
@Injectable()
export class VkLinkUseCases {
  constructor(@Inject(VkLinkRepository) private readonly links: VkLinkRepository) {}

  async issueToken(principal: AuthenticatedPrincipal): Promise<object> {
    if (!principal.user) throw fail(HttpStatus.NOT_FOUND, 'Сначала откройте приложение из Telegram-бота.')
    const token = String(crypto.randomInt(0, 10_000)).padStart(4, '0')
    const now = Date.now()
    const expiresAt = sqliteTimestamp(now + TOKEN_TTL_MINUTES * 60_000)
    await this.links.createToken(principal.user.id, hash(token), expiresAt, sqliteTimestamp(now))
    await this.links.appendAudit(principal.user.id, 'vk_link_token_created', {}, sqliteTimestamp(now)).catch(() => {})
    return { ok: true, data: { token, expires_at: expiresAt } }
  }

  async confirm(vkUserId: number | null, code: string): Promise<object> {
    if (vkUserId == null) throw fail(HttpStatus.FORBIDDEN, 'Подтверждение доступно только из VK.')
    const now = sqliteTimestamp()
    const targetUserId = await this.links.consumeToken(hash(code.trim()), now)
    if (!targetUserId) throw fail(HttpStatus.BAD_REQUEST, 'Код недействителен или истёк. Создайте новый код в Telegram.')
    const result = await this.links.linkVk(targetUserId, vkUserId, now)
    if (result === 'missing') throw fail(HttpStatus.INTERNAL_SERVER_ERROR, 'Не удалось завершить привязку.')
    if (result === 'already') return { ok: true, data: { linked: true, already: true } }
    if (result === 'other_vk') {
      throw fail(HttpStatus.CONFLICT, 'К этому аккаунту Telegram уже привязан другой профиль VK. Обратитесь к администратору.')
    }
    if (result === 'blocked') {
      throw fail(
        HttpStatus.CONFLICT,
        'С этим аккаунтом VK уже связаны данные (заявка, сообщения или чат). Свяжитесь с администратором для объединения.',
      )
    }
    await this.links.appendAudit(targetUserId, 'vk_link_completed', { vk_user_id: vkUserId }, now).catch(() => {})
    return { ok: true, data: { linked: true } }
  }
}
