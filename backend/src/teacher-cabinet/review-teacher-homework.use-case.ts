import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import type { TeacherReviewCommand } from './teacher-review.body.js'
import { TeacherCabinetRepository } from './teacher-cabinet.repository.js'

@Injectable()
export class ReviewTeacherHomeworkUseCase {
  constructor(
    @Inject(TeacherCabinetRepository)
    private readonly teacherCabinet: TeacherCabinetRepository,
    @Inject(UserNotificationGateway)
    private readonly notifications: UserNotificationGateway,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: TeacherReviewCommand,
  ): Promise<{ ok: true }> {
    if (!principal.user) {
      throw new HttpException(
        { ok: false, error: 'Пользователь не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    const isAdmin = principal.user.roles.includes('admin')
    const isTeacher = principal.user.roles.includes('teacher')
    if (!isTeacher && !isAdmin) {
      throw new HttpException(
        { ok: false, error: 'Доступ только для преподавателей.' },
        HttpStatus.FORBIDDEN,
      )
    }
    let teacherId = isTeacher
      ? await this.teacherCabinet.findTeacherIdByUserId(principal.user.id)
      : null
    if (teacherId == null && !isAdmin) {
      throw new HttpException(
        { ok: false, error: 'Доступ только для преподавателей.' },
        HttpStatus.FORBIDDEN,
      )
    }
    if (teacherId == null) {
      teacherId = await this.teacherCabinet.ensureTeacherForUser(principal.user.id)
    }

    const target = await this.teacherCabinet.findReviewTarget(command.homeworkId)
    if (!target) {
      throw new HttpException(
        { ok: false, error: 'Задание не найдено.' },
        HttpStatus.NOT_FOUND,
      )
    }
    if (target.status !== 'pending') {
      throw new HttpException(
        { ok: false, error: 'Это задание уже проверено.' },
        HttpStatus.CONFLICT,
      )
    }
    const activeStudent = ['studying', 'completed'].includes(target.studentStatus)
    const assignedTeacher = target.assignedTeacherIds.includes(teacherId)
    if (!activeStudent || (!isAdmin && !assignedTeacher)) {
      throw new HttpException(
        { ok: false, error: 'Ученик не прикреплён к этому преподавателю.' },
        HttpStatus.FORBIDDEN,
      )
    }

    const comment = command.comment?.trim() || null
    const reviewStatus = command.rating != null ? 'approved' : 'rejected'
    if (command.rating == null && !comment) {
      throw new HttpException(
        { ok: false, error: 'Укажите оценку или напишите комментарий.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const homeworkStatus = reviewStatus === 'approved' ? 'approved' : 'revision'
    const lessonText = target.isBonus
      ? 'дополнительное задание'
      : `урок №${target.lessonNumber}`
    const chatText =
      reviewStatus === 'approved'
        ? `✅ Проверка ДЗ (${lessonText}): принято.${command.rating ? ` Оценка: ${command.rating}/5.` : ''}${comment ? ` Комментарий: ${comment}` : ''}`
        : `❌ Проверка ДЗ (${lessonText}): нужна доработка.${comment ? ` Комментарий: ${comment}` : ''}`
    const notificationBody =
      reviewStatus === 'approved'
        ? `Задание по ${lessonText} принято. Оценка: ${command.rating} из 5.${comment ? `\nКомментарий: ${comment}` : ''}`
        : `Задание по ${lessonText} нужно доработать.${comment ? `\nКомментарий: ${comment}` : ''}`
    const feedbackMilestone =
      reviewStatus === 'approved' &&
      !target.isBonus &&
      target.lessonNumber != null &&
      [5, 10, 15].includes(target.lessonNumber)
        ? target.lessonNumber
        : null
    const feedbackNotificationBody =
      feedbackMilestone == null
        ? null
        : `Урок №${feedbackMilestone} принят. Расскажите администратору, как проходит обучение. Отзыв недоступен преподавателю.`

    const saved = await this.teacherCabinet.saveReview({
      homeworkId: target.id,
      studentId: target.studentId,
      studentUserId: target.studentUserId,
      actorUserId: principal.user.id,
      teacherId,
      rating: reviewStatus === 'approved' ? command.rating : null,
      comment,
      reviewStatus,
      homeworkStatus,
      reviewedAt: sqliteTimestamp(),
      chatText,
      notificationBody,
      notificationPayload: JSON.stringify({
        homework_id: target.id,
        status: homeworkStatus,
      }),
      feedbackMilestone,
      feedbackNotificationBody,
    })
    if (!saved) {
      throw new HttpException(
        { ok: false, error: 'Это задание уже проверено.' },
        HttpStatus.CONFLICT,
      )
    }

    const telegramMessage =
      reviewStatus === 'approved'
        ? `✅ Твое задание по ${lessonText} проверено.\nОценка: ${'⭐'.repeat(command.rating ?? 0)}\n${comment ? `Комментарий: ${comment}` : ''}`
        : `❌ Твое задание по ${lessonText} нужно доработать.\n${comment ? `Комментарий: ${comment}` : ''}`
    await this.notifications.send(target.studentTelegramId, telegramMessage)
    return { ok: true }
  }
}
