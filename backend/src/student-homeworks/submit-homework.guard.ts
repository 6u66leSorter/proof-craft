import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { HomeworkSubmissionStorage } from './homework-submission.storage.js'
import type { SubmitHomeworkRequest } from './submit-homework.request.js'

const uploadLimitMb = (): number => {
  const configured = Number(process.env.MAX_HOMEWORK_UPLOAD_MB ?? 450)
  return Number.isFinite(configured) && configured > 0 ? configured : 450
}

const errorCode = (error: unknown): unknown =>
  (error as { code?: unknown } | null)?.code

@Injectable()
export class SubmitHomeworkGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationGuard)
    private readonly authentication: AuthenticationGuard,
    @Inject(HomeworkSubmissionStorage)
    private readonly storage: HomeworkSubmissionStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<SubmitHomeworkRequest & FastifyRequest>()
    const stagedPaths: string[] = []
    try {
      const fields: Record<string, string> = {}
      const files = []
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (!['file', 'files'].includes(part.fieldname)) {
            part.file.resume()
            continue
          }
          if (files.length >= 5) {
            part.file.resume()
            throw new Error('TOO_MANY_FILES')
          }
          const file = await this.storage.stage(
            part.file,
            part.filename,
            part.mimetype,
          )
          files.push(file)
          stagedPaths.push(file.path)
        } else {
          fields[part.fieldname] = String(part.value ?? '')
        }
      }
      const telegramId = Number(fields.telegram_id)
      if (!telegramId) {
        throw new HttpException(
          { ok: false, error: 'Передайте telegram_id.' },
          HttpStatus.BAD_REQUEST,
        )
      }
      request.body = { telegram_id: telegramId }
      request.homeworkSubmission = { fields, files }
      await this.authentication.canActivate(context)
      return true
    } catch (error) {
      await Promise.all(stagedPaths.map((path) => this.storage.discard(path)))
      if (error instanceof HttpException) throw error
      if (errorCode(error) === 'FST_REQ_FILE_TOO_LARGE') {
        throw new HttpException(
          {
            ok: false,
            error: `Файл слишком большой. Максимум ${Math.round(uploadLimitMb())} МБ.`,
          },
          HttpStatus.PAYLOAD_TOO_LARGE,
        )
      }
      if ((error as Error).message === 'TOO_MANY_FILES' || errorCode(error) === 'FST_FILES_LIMIT') {
        throw new HttpException(
          { ok: false, error: 'Можно прикрепить не более 5 файлов за одну отправку.' },
          HttpStatus.BAD_REQUEST,
        )
      }
      throw new HttpException(
        { ok: false, error: 'Не удалось загрузить работу. Попробуйте позже.' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }
}
