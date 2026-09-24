import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import { VkLinkRepository, type VkLinkResult } from './vk-link.repository.js'

@Injectable()
export class PrismaVkLinkRepository extends VkLinkRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super()
  }

  async createToken(userId: number, tokenHash: string, expiresAt: string, now: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.vk_link_tokens.deleteMany({ where: { OR: [{ user_id: userId }, { expires_at: { lt: now } }] } }),
      this.prisma.vk_link_tokens.create({ data: { user_id: userId, token_hash: tokenHash, expires_at: expiresAt, created_at: now } }),
    ])
  }

  async consumeToken(tokenHash: string, now: string): Promise<number | null> {
    return await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.vk_link_tokens.findFirst({
        where: { token_hash: tokenHash, expires_at: { gt: now } },
        select: { id: true, user_id: true },
      })
      if (!row) return null
      const deleted = await transaction.vk_link_tokens.deleteMany({ where: { id: row.id } })
      return deleted.count === 1 ? row.user_id : null
    })
  }

  async linkVk(targetUserId: number, vkUserId: number, now: string): Promise<VkLinkResult> {
    return await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.users.findUnique({ where: { id: targetUserId }, select: { vk_user_id: true } })
      if (!target) return 'missing'
      if (target.vk_user_id != null) return Number(target.vk_user_id) === vkUserId ? 'already' : 'other_vk'

      const existing = await transaction.users.findFirst({ where: { vk_user_id: BigInt(vkUserId) }, select: { id: true } })
      if (existing && existing.id !== targetUserId) {
        const [student, teacher, message] = await Promise.all([
          transaction.students.findUnique({ where: { user_id: existing.id }, select: { id: true } }),
          transaction.teachers.findUnique({ where: { user_id: existing.id }, select: { id: true } }),
          transaction.chat_messages.findFirst({ where: { sender_user_id: existing.id }, select: { id: true } }),
        ])
        if (student || teacher || message) return 'blocked'
        await transaction.audit_log.deleteMany({ where: { actor_user_id: existing.id } })
        await transaction.app_notifications.deleteMany({ where: { user_id: existing.id } })
        await transaction.vk_link_tokens.deleteMany({ where: { user_id: existing.id } })
        await transaction.user_roles.deleteMany({ where: { user_id: existing.id } })
        await transaction.users.delete({ where: { id: existing.id } })
      }
      await transaction.users.update({ where: { id: targetUserId }, data: { vk_user_id: BigInt(vkUserId), updated_at: now } })
      return 'linked'
    })
  }

  async appendAudit(userId: number, action: string, meta: object, now: string): Promise<void> {
    await this.prisma.audit_log.create({ data: { actor_user_id: userId, action, meta: JSON.stringify(meta), created_at: now } })
  }
}
