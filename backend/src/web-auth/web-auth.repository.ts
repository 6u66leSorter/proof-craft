export type WebLoginProvider = 'telegram' | 'vk'
export type WebLoginState = 'pending' | 'approved' | 'expired'

export abstract class WebAuthRepository {
  /** Создаёт одноразовый запрос входа и заодно удаляет просроченные. */
  abstract createLoginRequest(provider: WebLoginProvider, tokenHash: string, expiresAt: string, now: string): Promise<void>
  abstract getLoginState(tokenHash: string, now: string): Promise<WebLoginState>
  /** Подтверждает запрос, если он не истёк, не применён и относится к этому провайдеру. */
  abstract approveLoginRequest(tokenHash: string, provider: WebLoginProvider, userId: number, now: string): Promise<boolean>
  /** Забирает подтверждённый запрос ровно один раз и выпускает web-сессию. */
  abstract consumeLoginRequest(
    tokenHash: string,
    sessionTokenHash: string,
    sessionExpiresAt: string,
    now: string,
  ): Promise<{ userId: number; telegramId: number } | null>
  abstract deleteSession(tokenHash: string): Promise<void>
  /** Legacy `getOrCreateUser` для VK: по vk_user_id, затем по синтетическому telegram_id, иначе новый guest. */
  abstract findOrCreateVkUser(vkUserId: number, syntheticTelegramId: number, now: string): Promise<number>
  abstract appendAudit(userId: number, action: string, meta: object, now: string): Promise<void>
}
