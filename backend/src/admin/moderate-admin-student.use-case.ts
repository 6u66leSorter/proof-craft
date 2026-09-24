import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import type {
  AdminStudentAction,
  ModerateAdminStudentCommand,
} from './admin-student-moderation.body.js'
import { AdminStudentModerationRepository } from './admin-student-moderation.repository.js'

const statusByAction: Record<AdminStudentAction, string> = {
  approve: 'studying',
  reject: 'rejected',
  set_studying: 'studying',
  set_completed: 'completed',
}

const auditByAction: Record<AdminStudentAction, string> = {
  approve: 'admin_student_approve',
  reject: 'admin_student_reject',
  set_studying: 'admin_student_set_studying',
  set_completed: 'admin_student_set_completed',
}

const messageByAction: Record<AdminStudentAction, string> = {
  approve: '🎉 Ваша заявка одобрена! Теперь вы можете сдавать домашние задания.',
  reject: 'К сожалению, ваша заявка была отклонена.',
  set_studying: 'Ваш статус обучения обновлен: обучается.',
  set_completed: 'Ваш статус обучения обновлен: завершил обучение.',
}

@Injectable()
export class ModerateAdminStudentUseCase {
  constructor(
    @Inject(AdminStudentModerationRepository)
    private readonly students: AdminStudentModerationRepository,
    @Inject(UserNotificationGateway)
    private readonly notifications: UserNotificationGateway,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: ModerateAdminStudentCommand,
  ): Promise<{ ok: true }> {
    const admin = requireAdminPrincipal(principal)
    const student = await this.students.findStudent(command.studentId)
    if (!student) {
      throw new HttpException(
        { ok: false, error: 'Ученик не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const replaceTeacherIds =
      command.action === 'approve' && command.teacherIds?.length
        ? [...new Set(command.teacherIds)]
        : null
    if (replaceTeacherIds) {
      const missingTeacherId = await this.students.findFirstMissingTeacherId(
        replaceTeacherIds,
      )
      if (missingTeacherId != null) {
        throw new HttpException(
          {
            ok: false,
            error: `Преподаватель с id ${missingTeacherId} не найден.`,
          },
          HttpStatus.BAD_REQUEST,
        )
      }
    }

    const message = messageByAction[command.action]
    await this.students.saveModeration({
      studentId: student.id,
      studentUserId: student.userId,
      actorUserId: admin.id,
      action: command.action,
      status: statusByAction[command.action],
      auditAction: auditByAction[command.action],
      message,
      updatedAt: sqliteTimestamp(),
      replaceTeacherIds,
    })
    await this.notifications.send(student.telegramId, message)
    return { ok: true }
  }
}
