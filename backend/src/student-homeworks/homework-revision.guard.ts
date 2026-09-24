import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { HomeworkSubmissionStorage, type StagedHomeworkFile } from './homework-submission.storage.js'
import { parseHomeworkId, type HomeworkRevisionRequest } from './homework-revision.request.js'

const uploadLimitMb = (): number => {
  const configured = Number(process.env.MAX_HOMEWORK_UPLOAD_MB ?? 450)
  return Number.isFinite(configured) && configured > 0 ? configured : 450
}

/**
 * Разбор multipart исправления (legacy порядок: id работы → тело → telegram_id → подпись).
 * Промежуточный файл удаляется при любой ошибке до use case.
 */
@Injectable()
export class HomeworkRevisionGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationGuard) private readonly authentication: AuthenticationGuard,
    @Inject(HomeworkSubmissionStorage) private readonly storage: HomeworkSubmissionStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<HomeworkRevisionRequest & FastifyRequest>()
    const homeworkId = parseHomeworkId(request.params)
    let file: StagedHomeworkFile | null = null
    try {
      const fields: Record<string, string> = {}
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (file) {
            part.file.resume()
            continue
          }
          file = await this.storage.stage(part.file, part.filename, part.mimetype)
        } else {
          fields[part.fieldname] = String(part.value ?? '')
        }
      }
      const telegramId = Number(fields.telegram_id)
      if (!telegramId) {
        throw new HttpException({ ok: false, error: 'Передайте telegram_id.' }, HttpStatus.BAD_REQUEST)
      }
      request.body = { telegram_id: telegramId }
      request.homeworkRevision = { homeworkId, fields, file }
      await this.authentication.canActivate(context)
      return true
    } catch (error) {
      await this.storage.discard(file?.path ?? null)
      if (error instanceof HttpException) throw error
      if ((error as { code?: unknown } | null)?.code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new HttpException(
          { ok: false, error: `Файл слишком большой. Максимум ${Math.round(uploadLimitMb())} МБ.` },
          HttpStatus.PAYLOAD_TOO_LARGE,
        )
      }
      throw new HttpException(
        { ok: false, error: 'Не удалось отправить исправление. Попробуйте позже.' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }
}
