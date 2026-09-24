import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { UserNotificationGateway } from '../notifications/user-notification.gateway.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import {
  HomeworkSubmissionStorage,
  type FinalHomeworkFile,
  UnsupportedHomeworkImageError,
} from './homework-submission.storage.js'
import type { HomeworkRevisionCommand } from './homework-revision.request.js'
import { studentHomeworkResponse } from './student-homework.response.js'
import { StudentHomeworksRepository } from './student-homeworks.repository.js'

const fail = (status: HttpStatus, error: string): HttpException => new HttpException({ ok: false, error }, status)

const RESULT_ERRORS = {
  not_found: () => fail(HttpStatus.NOT_FOUND, 'Работа не найдена.'),
  not_revision: () => fail(HttpStatus.BAD_REQUEST, 'Исправление доступно только для работ со статусом «нужна доработка».'),
  no_text: () => fail(HttpStatus.BAD_REQUEST, 'Опишите, что вы исправили.'),
}

/**
 * Исправление работы учеником:
 * работа возвращается на проверку, преподаватели и администраторы получают Telegram- и in-app уведомления.
 */
@Injectable()
export class SubmitHomeworkRevisionUseCase {
  constructor(
    @Inject(StudentHomeworksRepository) private readonly homeworks: StudentHomeworksRepository,
    @Inject(HomeworkSubmissionStorage) private readonly storage: HomeworkSubmissionStorage,
    @Inject(FileReferenceService) private readonly files: FileReferenceService,
    @Inject(UserNotificationGateway) private readonly notifications: UserNotificationGateway,
  ) {}

  async execute(principal: AuthenticatedPrincipal, command: HomeworkRevisionCommand): Promise<object> {
    const student = principal.user ? await this.homeworks.findSubmissionStudent(principal.user.id) : null
    if (!student) throw fail(HttpStatus.NOT_FOUND, 'Ученик не найден.')
    if (student.status !== 'studying') {
      throw fail(HttpStatus.FORBIDDEN, 'Отправка исправлений доступна только ученикам в статусе «обучается».')
    }
    const text = String(command.fields.revision_text ?? command.fields.text ?? '').trim()

    let finalized: FinalHomeworkFile | null = null
    try {
      if (command.file) finalized = await this.storage.finalize(command.file)
      if (finalized && !finalized.mimeType.toLowerCase().startsWith('image/')) {
        throw fail(HttpStatus.BAD_REQUEST, 'К исправлению можно прикрепить только изображение.')
      }
      const snapshotBefore = await this.homeworks.findByUserId(principal.user!.id)
      const target = snapshotBefore?.homeworks.find(({ id }) => id === command.homeworkId)
      const lessonText = target?.isBonus ? 'дополнительное задание' : `урок №${target?.lessonNumber}`
      const notificationBody = `Ученик ${student.fullName} отправил исправление по ${lessonText}.`
      const result = await this.homeworks.submitRevision({
        studentId: student.id,
        homeworkId: command.homeworkId,
        text,
        revisionFileId: finalized?.path ?? null,
        updatedAt: sqliteTimestamp(),
        notificationBody,
        recipientUserIds: [...student.teachers, ...student.admins].map(({ userId }) => userId),
      })
      if (result !== 'submitted') throw RESULT_ERRORS[result]()

      const telegramIds = (recipients: Array<{ telegramId: number }>) =>
        recipients.map(({ telegramId }) => telegramId).filter((id) => Number.isInteger(id) && id > 0)
      await Promise.allSettled(telegramIds(student.teachers).map((id) => this.notifications.send(id, notificationBody)))
      await Promise.allSettled(telegramIds(student.admins).map((id) => this.notifications.send(id, notificationBody)))

      const snapshot = await this.homeworks.findByUserId(principal.user!.id)
      const homework = snapshot?.homeworks.find(({ id }) => id === command.homeworkId)
      return { ok: true, data: { homework: homework ? studentHomeworkResponse(homework, this.files, { withReviewCount: false }) : null } }
    } catch (error) {
      if (finalized) await this.storage.discard(finalized.path)
      if (error instanceof HttpException) throw error
      if (error instanceof UnsupportedHomeworkImageError) {
        throw fail(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          'Формат HEIC/HEIF не поддерживается на сервере. Сохраните фото как JPG/JPEG и повторите.',
        )
      }
      throw fail(HttpStatus.INTERNAL_SERVER_ERROR, 'Не удалось отправить исправление. Попробуйте позже.')
    }
  }
}
