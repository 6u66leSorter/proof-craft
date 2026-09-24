export type VkLinkResult = 'linked' | 'already' | 'other_vk' | 'blocked' | 'missing'

export abstract class VkLinkRepository {
  /** Удаляет прежние коды пользователя и все просроченные, затем сохраняет новый. */
  abstract createToken(userId: number, tokenHash: string, expiresAt: string, now: string): Promise<void>
  /** Сжигает действующий код и возвращает его владельца. */
  abstract consumeToken(tokenHash: string, now: string): Promise<number | null>
  /** Привязывает VK к пользователю; пустой аккаунт с этим VK удаляется, аккаунт с данными — блокирует. */
  abstract linkVk(targetUserId: number, vkUserId: number, now: string): Promise<VkLinkResult>
  abstract appendAudit(userId: number, action: string, meta: object, now: string): Promise<void>
}
