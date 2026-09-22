export type UserIdentity = {
  id: number
  telegramId: number
  vkUserId: number | null
  roles: string[]
}

export abstract class UserIdentityRepository {
  abstract findByTelegramId(telegramId: number): Promise<UserIdentity | null>
  abstract findByVkUserId(vkUserId: number): Promise<UserIdentity | null>
  abstract findByWebSessionTokenHash(tokenHash: string, now: string): Promise<UserIdentity | null>
  abstract touchWebSession(tokenHash: string, now: string): Promise<void>
}
