import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import type { HomeworkCommentCommand } from './homework-comment.body.js'
import { HomeworkCommentRepository } from './homework-comment.repository.js'

const ACTIVE_STUDENT_STATUSES = ['studying', 'completed']

/**
 * Комментарий к работе: пишут владелец, назначенный
 * преподаватель активного ученика и администратор. Комментарий преподавателя уведомляет ученика,
 * ответ ученика — всех его преподавателей; комментарий администратора без роли преподавателя
 * уведомлений не создаёт.
 */
@Injectable()
export class AddHomeworkCommentUseCase {
  constructor(
    @Inject(HomeworkCommentRepository)
    private readonly comments: HomeworkCommentRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal, command: HomeworkCommentCommand): Promise<{ ok: true }> {
    const target = principal.user ? await this.comments.findTarget(command.homeworkId) : null
    if (!principal.user || !target) {
      throw new HttpException({ ok: false, error: 'Домашнее задание не найдено.' }, HttpStatus.NOT_FOUND)
    }
    const user = principal.user
    const roles = user.roles
    const isOwner = target.studentUserId === user.id
    const isAssignedTeacher =
      roles.includes('teacher') &&
      ACTIVE_STUDENT_STATUSES.includes(target.studentStatus) &&
      target.assignedTeacherUserIds.includes(user.id)
    if (!roles.includes('admin') && !isOwner && !isAssignedTeacher) {
      throw new HttpException({ ok: false, error: 'Нет доступа к этому заданию.' }, HttpStatus.FORBIDDEN)
    }

    const payload = JSON.stringify({ homework_id: target.homeworkId, student_id: target.studentId })
    const notifications: Array<{ userId: number; kind: string; body: string; payload: string }> = []
    if (roles.includes('teacher') && !isOwner) {
      notifications.push({
        userId: target.studentUserId,
        kind: 'homework_comment',
        body: 'Преподаватель оставил комментарий к вашему домашнему заданию.',
        payload,
      })
    }
    if (isOwner) {
      for (const teacherUserId of target.assignedTeacherUserIds) {
        notifications.push({
          userId: teacherUserId,
          kind: 'homework_comment_reply',
          body: 'Ученик ответил на комментарий к домашнему заданию.',
          payload,
        })
      }
    }

    await this.comments.save({
      homeworkId: target.homeworkId,
      authorUserId: user.id,
      text: command.text,
      createdAt: sqliteTimestamp(),
      notifications,
    })
    return { ok: true }
  }
}
