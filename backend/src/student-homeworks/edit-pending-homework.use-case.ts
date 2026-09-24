import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { HomeworkSubmissionStorage, type FinalHomeworkFile } from './homework-submission.storage.js'
import { parseRemovedAttachmentIds, type HomeworkEditCommand } from './homework-edit.request.js'
import { StudentHomeworksRepository } from './student-homeworks.repository.js'

const fail = (status: HttpStatus, error: string): HttpException => new HttpException({ ok: false, error }, status)
const notPending = () => fail(HttpStatus.FORBIDDEN, 'Редактировать можно только задания, ещё не проверенные преподавателем.')

const contentType = (mimeType: string): string =>
  mimeType.startsWith('image/') ? 'photo' : mimeType.startsWith('video/') ? 'video' : 'document'

/**
 * Правка работы на проверке: название, описание,
 * удаление основного файла и вложений, новые вложения. Ответ — строка работы с флагами файлов.
 * Файлы удалённых вложений остаются на диске.
 */
@Injectable()
export class EditPendingHomeworkUseCase {
  constructor(
    @Inject(StudentHomeworksRepository) private readonly homeworks: StudentHomeworksRepository,
    @Inject(HomeworkSubmissionStorage) private readonly storage: HomeworkSubmissionStorage,
    @Inject(FileReferenceService) private readonly files: FileReferenceService,
  ) {}

  async execute(principal: AuthenticatedPrincipal, command: HomeworkEditCommand): Promise<object> {
    const student = principal.user ? await this.homeworks.findSubmissionStudent(principal.user.id) : null
    if (!student) throw fail(HttpStatus.NOT_FOUND, 'Ученик не найден.')
    const owner = await this.homeworks.findHomeworkOwner(command.homeworkId)
    if (!owner || owner.studentId !== student.id) throw fail(HttpStatus.NOT_FOUND, 'Задание не найдено.')
    if (owner.status !== 'pending') throw notPending()

    const finalized: FinalHomeworkFile[] = []
    try {
      for (const file of command.files) finalized.push(await this.storage.finalize(file))
      const { fields } = command
      const result = await this.homeworks.editPendingHomework({
        studentId: student.id,
        homeworkId: command.homeworkId,
        textContent: fields.text_content,
        haircutName: fields.haircut_name,
        removePrimary: fields.remove_primary === '1',
        removeAttachmentIds: parseRemovedAttachmentIds(fields.remove_attachment_ids),
        newAttachments: finalized.map((file) => ({ fileId: file.path, contentType: contentType(file.mimeType) })),
        updatedAt: sqliteTimestamp(),
      })
      if (result === 'not_found') throw fail(HttpStatus.NOT_FOUND, 'Задание не найдено.')
      if (result === 'not_pending') throw notPending()
    } catch (error) {
      await Promise.all(finalized.map((file) => this.storage.discard(file.path)))
      if (error instanceof HttpException) throw error
      throw fail(HttpStatus.INTERNAL_SERVER_ERROR, 'Внутренняя ошибка сервера.')
    }

    const row = await this.homeworks.findRawHomework(command.homeworkId)
    if (!row) throw fail(HttpStatus.NOT_FOUND, 'Задание не найдено.')
    const primary = this.files.getAvailability(row.file_id)
    const attachments = (await this.homeworks.listAttachments(command.homeworkId)).map((attachment) => {
      const availability = this.files.getAvailability(attachment.fileId)
      return {
        id: attachment.id,
        content_type: attachment.contentType,
        has_local_file: availability.hasLocalFile,
        has_telegram_file: availability.hasTelegramFile,
      }
    })
    return {
      ok: true,
      data: {
        homework: {
          ...row,
          has_local_file: primary.hasLocalFile,
          has_telegram_file: primary.hasTelegramFile,
          extra_files_count: attachments.length,
          attachments,
        },
      },
    }
  }
}
