import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  RegistrationRepository,
  type RegistrationStudent,
  type SavedStudentRegistration,
  type SavedTeacherApplication,
  type SaveStudentRegistration,
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

  async findStudentByUserId(userId: number): Promise<RegistrationStudent | null> {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      include: { users: true },
    })
    return student ? this.toRegistrationStudent(student) : null
  }

  async saveStudentRegistration(
    command: SaveStudentRegistration,
  ): Promise<SavedStudentRegistration> {
    return await this.prisma.$transaction(async (transaction) => {
      const user = command.existingUserId == null
        ? await transaction.users.create({
            data: {
              telegram_id: BigInt(command.claimedTelegramId),
              username: command.username,
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
            select: { id: true, role: true },
          })
        : await transaction.users.update({
            where: { id: command.existingUserId },
            data: {
              ...(command.username == null ? {} : { username: command.username }),
              first_name: command.firstName,
              ...(command.lastName == null ? {} : { last_name: command.lastName }),
              ...(command.vkUserId == null
                ? {}
                : { vk_user_id: BigInt(command.vkUserId) }),
              updated_at: command.createdAt,
            },
            select: { id: true, role: true },
          })

      if (user.role) {
        await transaction.user_roles.upsert({
          where: { user_id_role: { user_id: user.id, role: user.role } },
          update: {},
          create: { user_id: user.id, role: user.role, created_at: command.createdAt },
        })
      }
      await transaction.user_roles.upsert({
        where: { user_id_role: { user_id: user.id, role: 'student' } },
        update: {},
        create: { user_id: user.id, role: 'student', created_at: command.createdAt },
      })
      const student = await transaction.students.create({
        data: {
          user_id: user.id,
          full_name: command.fullName,
          phone: command.phone,
          lessons_count: command.lessonsCount,
          status: 'moderation',
          metro: command.metro,
          created_at: command.createdAt,
          updated_at: command.createdAt,
        },
        include: { users: true },
      })
      const roles = await transaction.user_roles.findMany({
        where: { user_id: user.id },
        select: { role: true },
        orderBy: { role: 'asc' },
      })
      const admins = await transaction.users.findMany({
        where: { user_roles: { some: { role: 'admin' } } },
        select: { id: true, telegram_id: true },
      })
      if (admins.length) {
        await transaction.app_notifications.createMany({
          data: admins.map((admin) => ({
            user_id: admin.id,
            kind: 'new_student',
            body: command.adminMessage,
            payload: JSON.stringify({
              source: 'mini_app',
              telegram_id: command.claimedTelegramId,
              full_name: command.fullName,
            }),
            created_at: command.createdAt,
          })),
        })
      }
      return {
        student: this.toRegistrationStudent(student),
        roles: roles.map(({ role }) => role),
        adminTelegramIds: admins.map(({ telegram_id }) => Number(telegram_id)),
      }
    })
  }

  async saveStudentFeedback(
    userId: number,
    requestKey: string,
    subject: string,
    message: string,
    createdAt: string,
  ): Promise<boolean> {
    return await this.prisma.$transaction(async (transaction) => {
      const student = await transaction.students.findUnique({
        where: { user_id: userId },
        select: { id: true },
      })
      if (!student) return false
      await transaction.private_feedback.upsert({
        where: {
          student_id_request_key: {
            student_id: student.id,
            request_key: requestKey,
          },
        },
        update: {},
        create: {
          student_id: student.id,
          request_key: requestKey,
          subject,
          message,
          created_at: createdAt,
        },
      })
      return true
    })
  }

  private toRegistrationStudent(student: {
    id: number
    user_id: number
    full_name: string
    phone: string
    lessons_count: number
    status: string
    created_at: string
    updated_at: string
    student_track: string
    metro: string | null
    avatar_file_id: string | null
    about_me: string | null
    users: {
      telegram_id: bigint
      username: string | null
      first_name: string | null
      last_name: string | null
    }
  }): RegistrationStudent {
    return {
      id: student.id,
      user_id: student.user_id,
      full_name: student.full_name,
      phone: student.phone,
      lessons_count: student.lessons_count,
      status: student.status,
      created_at: student.created_at,
      updated_at: student.updated_at,
      student_track: student.student_track,
      metro: student.metro,
      avatar_file_id: student.avatar_file_id,
      about_me: student.about_me,
      telegram_id: Number(student.users.telegram_id),
      username: student.users.username,
      first_name: student.users.first_name,
      last_name: student.users.last_name,
    }
  }
}
