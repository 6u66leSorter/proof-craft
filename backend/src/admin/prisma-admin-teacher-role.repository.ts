import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  AdminTeacherRoleRepository,
  type AdminTeacherRoleTarget,
  type SaveAdminTeacherRole,
} from './admin-teacher-role.repository.js'

@Injectable()
export class PrismaAdminTeacherRoleRepository
  implements AdminTeacherRoleRepository
{
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findTargetByTelegramId(
    telegramId: number,
  ): Promise<AdminTeacherRoleTarget | null> {
    const user = await this.prisma.users.findUnique({
      where: { telegram_id: BigInt(telegramId) },
      select: {
        id: true,
        telegram_id: true,
        username: true,
        first_name: true,
        last_name: true,
        teachers: { select: { id: true } },
      },
    })
    return user
      ? {
          userId: user.id,
          telegramId: Number(user.telegram_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          teacherId: user.teachers?.id ?? null,
        }
      : null
  }

  async saveRoleChange(command: SaveAdminTeacherRole): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      if (command.action === 'assign') {
        await transaction.user_roles.upsert({
          where: {
            user_id_role: {
              user_id: command.target.userId,
              role: 'teacher',
            },
          },
          update: {},
          create: { user_id: command.target.userId, role: 'teacher' },
        })
        if (command.target.teacherId == null) {
          await transaction.teachers.create({
            data: {
              user_id: command.target.userId,
              full_name: command.teacherName ?? 'Преподаватель',
            },
          })
        }
      } else {
        await transaction.user_roles.deleteMany({
          where: { user_id: command.target.userId, role: 'teacher' },
        })
        if (command.target.teacherId != null) {
          await transaction.student_teachers.deleteMany({
            where: { teacher_id: command.target.teacherId },
          })
        }
      }

      await transaction.audit_log.create({
        data: {
          actor_user_id: command.actorUserId,
          action: `admin_teacher_${command.action}`,
          meta: JSON.stringify({
            target_telegram_id: command.target.telegramId,
          }),
        },
      })
      await transaction.app_notifications.create({
        data: {
          user_id: command.target.userId,
          kind: command.notificationKind,
          body: command.message,
          payload: JSON.stringify({}),
        },
      })
    })
  }
}
