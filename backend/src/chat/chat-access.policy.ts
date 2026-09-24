import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import type { UserIdentity } from '../persistence/users/user-identity.repository.js'
import type { ChatStudentAccess } from './chat.repository.js'

@Injectable()
export class ChatAccessPolicy {
  requireUser(principal: AuthenticatedPrincipal): UserIdentity {
    if (principal.user) return principal.user
    throw new HttpException(
      { ok: false, error: 'Пользователь не найден.' },
      HttpStatus.NOT_FOUND,
    )
  }

  assertStudentAccess(
    user: UserIdentity,
    access: ChatStudentAccess | null,
    error: string,
  ): void {
    const isOwner = access?.ownerUserId === user.id
    const isAdmin = user.roles.includes('admin')
    const isAssignedTeacher =
      user.roles.includes('teacher') && Boolean(access?.isAssignedTeacher)
    if (isOwner || isAdmin || isAssignedTeacher) return
    throw new HttpException({ ok: false, error }, HttpStatus.FORBIDDEN)
  }
}
