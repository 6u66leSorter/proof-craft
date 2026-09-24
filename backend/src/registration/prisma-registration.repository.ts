import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  RegistrationRepository,
  type SavedTeacherApplication,
  type SaveTeacherApplication,
} from './registration.repository.js'

@Injectable()
export class PrismaRegistrationRepository implements RegistrationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async saveTeacherApplication(
    command: SaveTeacherApplication,
  ): Promise<SavedTeacherApplication> {
    return await this.prisma.$transaction(async (transaction) => {
      const user = command.existingUserId == null
        ? await transaction.users.create({
            data: {
              telegram_id: BigInt(command.claimedTelegramId),
              first_name: command.firstName,
              last_name: command.lastName,
              role: 'guest',
              vk_user_id:
                command.vkUserId == null ? null : BigInt(command.vkUserId),
              created_at: command.createdAt,
              updated_at: command.createdAt,
              user_roles: {
                create: { role: 'guest', created_at: command.createdAt },
              },
            },
            select: { id: true },
          })
        : await transaction.users.update({
            where: { id: command.existingUserId },
            data: {
              first_name: command.firstName,
              ...(command.lastName == null ? {} : { last_name: command.lastName }),
              ...(command.vkUserId == null
                ? {}
                : { vk_user_id: BigInt(command.vkUserId) }),
              updated_at: command.createdAt,
            },
            select: { id: true },
          })

      await transaction.teacher_applications.deleteMany({
        where: { applicant_user_id: user.id, status: 'pending' },
      })
      await transaction.teacher_applications.create({
        data: {
          applicant_user_id: user.id,
          full_name: command.fullName,
          phone: command.phone,
          status: 'pending',
          created_at: command.createdAt,
          updated_at: command.createdAt,
        },
      })

      const admins = await transaction.users.findMany({
        where: { user_roles: { some: { role: 'admin' } } },
        select: { id: true, telegram_id: true },
      })
      const payload = JSON.stringify({
        source: 'mini_app',
        telegram_id: command.claimedTelegramId,
        full_name: command.fullName,
        applicant_user_id: user.id,
      })
      if (admins.length) {
        await transaction.app_notifications.createMany({
          data: admins.map((admin) => ({
            user_id: admin.id,
            kind: 'teacher_application',
            body: command.adminMessage,
            payload,
            created_at: command.createdAt,
          })),
        })
      }
      return {
        adminTelegramIds: admins.map(({ telegram_id }) => Number(telegram_id)),
      }
    })
  }
}
