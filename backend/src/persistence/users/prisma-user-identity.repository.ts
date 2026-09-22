import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { UserIdentityRepository, type UserIdentity } from './user-identity.repository.js'

@Injectable()
export class PrismaUserIdentityRepository implements UserIdentityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByTelegramId(telegramId: number): Promise<UserIdentity | null> {
    const user = await this.prisma.users.findUnique({
      where: { telegram_id: telegramId },
      select: {
        id: true,
        telegram_id: true,
        vk_user_id: true,
        user_roles: {
          select: { role: true },
          orderBy: { role: 'asc' },
        },
      },
    })
    if (!user) return null

    return {
      id: user.id,
      telegramId: user.telegram_id,
      vkUserId: user.vk_user_id,
      roles: user.user_roles.map(({ role }) => role),
    }
  }
}
