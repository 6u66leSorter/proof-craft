import { Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import { UserIdentityRepository } from '../persistence/users/user-identity.repository.js'
import type { ChannelUser } from './channel.types.js'

/**
 * Пользователь мессенджера → внутренний пользователь (legacy `getOrCreateUser`): находит по
 * telegram_id, иначе создаёт guest. Существующему пользователю гарантирует строку роли из `users.role`.
 */
@Injectable()
export class MessengerIdentityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserIdentityRepository) private readonly users: UserIdentityRepository,
  ) {}

  async resolve(user: ChannelUser): Promise<AuthenticatedPrincipal> {
    const telegramId = BigInt(user.externalId)
    const now = sqliteTimestamp()
    const existing = await this.prisma.users.findUnique({ where: { telegram_id: telegramId }, select: { id: true, role: true } })
    if (!existing) {
      await this.prisma.users.create({
        data: {
          telegram_id: telegramId,
          username: user.username,
          first_name: user.firstName,
          last_name: user.lastName,
          role: 'guest',
          created_at: now,
          updated_at: now,
          user_roles: { create: { role: 'guest', created_at: now } },
        },
      })
    } else if (existing.role) {
      await this.prisma.user_roles.upsert({
        where: { user_id_role: { user_id: existing.id, role: existing.role } },
        create: { user_id: existing.id, role: existing.role, created_at: now },
        update: {},
      })
    }
    const identity = await this.users.findByTelegramId(user.externalId)
    return { provider: 'telegram', claimedTelegramId: user.externalId, user: identity }
  }
}

export const hasRole = (principal: AuthenticatedPrincipal, role: string): boolean => principal.user?.roles.includes(role) ?? false
