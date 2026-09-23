import { HttpException, HttpStatus } from '@nestjs/common'
import type { UserIdentity } from '../persistence/users/user-identity.repository.js'
import type { AuthenticatedPrincipal } from './auth.types.js'

export const requireAdminPrincipal = (
  principal: AuthenticatedPrincipal,
): UserIdentity => {
  if (!principal.user) {
    throw new HttpException(
      { ok: false, error: 'Пользователь не найден.' },
      HttpStatus.NOT_FOUND,
    )
  }
  if (!principal.user.roles.includes('admin')) {
    throw new HttpException(
      { ok: false, error: 'Доступ только для администраторов.' },
      HttpStatus.FORBIDDEN,
    )
  }
  return principal.user
}
