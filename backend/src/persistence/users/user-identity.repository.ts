export type UserIdentity = {
  id: number
  telegramId: number
  vkUserId: number | null
  roles: string[]
}

export abstract class UserIdentityRepository {
  abstract findByTelegramId(telegramId: number): Promise<UserIdentity | null>
}
