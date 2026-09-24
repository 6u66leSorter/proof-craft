import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import { RegistrationRepository } from './registration.repository.js'
import type { RegisterStudentCommand } from './student-registration.body.js'

const normalizePhone = (value: string): string | null => {
  const phone = value.replace(/\s+/g, '')
  return /^(\+?\d{10,15})$/.test(phone) ? phone : null
}

const parseLessons = (value: string | number): number | null => {
  const lessons = Number(String(value).replace(',', '.').trim())
  return Number.isFinite(lessons) && Number.isInteger(lessons) && lessons > 0
    ? lessons
    : null
}

@Injectable()
export class RegisterStudentUseCase {
  constructor(
    @Inject(RegistrationRepository)
    private readonly registrations: RegistrationRepository,
    @Inject(UserNotificationGateway)
    private readonly notifications: UserNotificationGateway,
  ) {}

  async execute(principal: AuthenticatedPrincipal, command: RegisterStudentCommand) {
    const fullName = command.fullName.trim()
    const fullNameParts = fullName.split(/\s+/).filter(Boolean)
    const firstName = fullNameParts[0] || command.firstName?.trim() || null
    const lastName = fullNameParts.length > 1
      ? fullNameParts.slice(1).join(' ')
      : command.lastName?.trim() || null
    const phone = normalizePhone(command.phone)
    const lessonsCount = parseLessons(command.lessonsCount)
    if (!fullName) {
      throw new HttpException(
        { ok: false, error: 'Укажите ФИО ученика.' },
        HttpStatus.BAD_REQUEST,
      )
    }
    if (!phone) {
      throw new HttpException(
        { ok: false, error: 'Укажите корректный номер телефона.' },
        HttpStatus.BAD_REQUEST,
      )
    }
    if (!lessonsCount) {
      throw new HttpException(
        { ok: false, error: 'Количество занятий должно быть целым числом больше нуля.' },
        HttpStatus.BAD_REQUEST,
      )
    }
    if (principal.user) {
      const existing = await this.registrations.findStudentByUserId(principal.user.id)
      if (existing) {
        throw new HttpException(
          { ok: false, error: 'Заявка уже существует.', data: { student: existing } },
          HttpStatus.CONFLICT,
        )
      }
    }

    const metro = command.metro?.trim() || null
    const vkOffset = Number(process.env.VK_ID_OFFSET || 10_000_000_000)
    const vkUserId = principal.provider === 'vk'
      ? principal.claimedTelegramId - vkOffset
      : principal.user?.vkUserId ?? null
    const metroNote = command.metro?.trim() || ''
    const adminMessage = `Новый ученик из мини-аппа:\n${fullName}\nТелефон: ${phone}${metroNote ? `\nМетро: ${metroNote}` : ''}\nЗанятий: ${lessonsCount}\n\nID в Telegram: ${principal.claimedTelegramId}`
    let result
    try {
      result = await this.registrations.saveStudentRegistration({
        existingUserId: principal.user?.id ?? null,
        claimedTelegramId: principal.claimedTelegramId,
        vkUserId,
        username: command.username || null,
        firstName: firstName ?? '',
        lastName,
        fullName,
        phone,
        lessonsCount,
        metro,
        adminMessage,
        createdAt: sqliteTimestamp(),
      })
    } catch (error) {
      const isUniqueConstraint =
        typeof error === 'object' && error != null && 'code' in error && error.code === 'P2002'
      const duplicate = isUniqueConstraint && principal.user
        ? await this.registrations.findStudentByUserId(principal.user.id)
        : null
      if (!duplicate) throw error
      throw new HttpException(
        {
          ok: false,
          error: 'Заявка с этого аккаунта уже существует.',
          data: { student: duplicate },
        },
        HttpStatus.CONFLICT,
      )
    }
    for (const telegramId of result.adminTelegramIds) {
      void this.notifications.send(telegramId, adminMessage).catch(() => {})
    }
    const primaryRole = result.roles.includes('admin')
      ? 'admin'
      : result.roles.includes('teacher')
        ? 'teacher'
        : 'student'
    return {
      ok: true as const,
      data: {
        student: {
          id: result.student.id,
          full_name: result.student.full_name,
          phone: result.student.phone,
          lessons_count: result.student.lessons_count,
          status: result.student.status,
        },
        role: primaryRole,
        roles: result.roles,
      },
    }
  }
}
