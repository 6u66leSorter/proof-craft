import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { HomeworkSubmissionStorage, type StagedHomeworkFile } from './homework-submission.storage.js'
import type { HomeworkEditRequest } from './homework-edit.request.js'
import { parseHomeworkId } from './homework-revision.request.js'

const MAX_FILES = 5

/**
 * Разбор multipart правки работы: принимаются поля `file`/`files`, не больше пяти файлов.
 * Ошибки загрузки не обрабатываются в маршруте — они уходят в общий обработчик с 500.
 */
@Injectable()
export class HomeworkEditGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationGuard) private readonly authentication: AuthenticationGuard,
    @Inject(HomeworkSubmissionStorage) private readonly storage: HomeworkSubmissionStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HomeworkEditRequest & FastifyRequest>()
    const homeworkId = parseHomeworkId(request.params)
    const files: StagedHomeworkFile[] = []
    try {
      const fields: Record<string, string> = {}
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (!['file', 'files'].includes(part.fieldname)) {
            part.file.resume()
            continue
          }
          if (files.length >= MAX_FILES) {
            part.file.resume()
            throw new Error('TOO_MANY_FILES')
          }
          files.push(await this.storage.stage(part.file, part.filename, part.mimetype))
        } else {
          fields[part.fieldname] = String(part.value ?? '')
        }
      }
      const telegramId = Number(fields.telegram_id)
      if (!telegramId) {
        throw new HttpException({ ok: false, error: 'Передайте telegram_id.' }, HttpStatus.BAD_REQUEST)
      }
      request.body = { telegram_id: telegramId }
      request.homeworkEdit = { homeworkId, fields, files }
      await this.authentication.canActivate(context)
      return true
    } catch (error) {
      await Promise.all(files.map((file) => this.storage.discard(file.path)))
      if (error instanceof HttpException) throw error
      throw new HttpException({ ok: false, error: 'Внутренняя ошибка сервера.' }, HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }
}
