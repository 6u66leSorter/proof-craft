import type { UserIdentity } from '../persistence/users/user-identity.repository.js'

export type AuthProvider = 'telegram' | 'vk' | 'web-session'

export type AuthenticatedPrincipal = {
  provider: AuthProvider
  claimedTelegramId: number
  user: UserIdentity | null
}

export type AuthenticationRequest = {
  headers: Record<string, string | string[] | undefined>
  query?: unknown
  authenticatedPrincipal?: AuthenticatedPrincipal
}
