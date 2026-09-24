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
import { ChatAttachmentStorage } from './chat-attachment.storage.js'
import {
  parseChatMessageId,
  parseChatMessagesQuery,
  type ChatRequest,
} from './chat.request.js'

@Injectable()
export class ChatAvailabilityGuard implements CanActivate {
  canActivate(): boolean {
    if (String(process.env.CHAT_ENABLED || 'true').toLowerCase() !== 'false') {
      return true
    }
    throw new HttpException(
      { ok: false, error: 'Чаты временно отключены.' },
      HttpStatus.SERVICE_UNAVAILABLE,
    )
  }
}

@Injectable()
export class ChatMessagesQueryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ChatRequest>()
    request.chatMessagesQuery = parseChatMessagesQuery(request.query)
    return true
  }
}

@Injectable()
export class ChatMessageFileGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ChatRequest>()
    request.chatMessageId = parseChatMessageId(request.params)
    return true
  }
}

const uploadLimitMb = (): number => {
  const configured = Number(process.env.MAX_HOMEWORK_UPLOAD_MB ?? 450)
  return Number.isFinite(configured) && configured > 0 ? configured : 450
}

const isMultipartLimitError = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 'FST_REQ_FILE_TOO_LARGE'

@Injectable()
export class ChatMessageMultipartGuard implements CanActivate {
  constructor(
    @Inject(AuthenticationGuard)
    private readonly authentication: AuthenticationGuard,
    @Inject(ChatAttachmentStorage)
    private readonly storage: ChatAttachmentStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ChatRequest & FastifyRequest>()
    let stagedPath: string | null = null
    try {
      const fields: Record<string, string> = {}
      let attachment = null
      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (attachment) {
            part.file.resume()
            continue
          }
          attachment = await this.storage.stage(
            part.file,
            part.filename,
            part.mimetype,
          )
          stagedPath = attachment.path
        } else {
          fields[part.fieldname] = String(part.value ?? '')
        }
      }
      const telegramId = Number(fields.telegram_id)
      const studentId = Number(fields.student_id)
      if (!telegramId || !studentId) {
        throw new HttpException(
          { ok: false, error: 'Передайте telegram_id и student_id.' },
          HttpStatus.BAD_REQUEST,
        )
      }
      request.body = { telegram_id: telegramId }
      request.chatMessageCommand = {
        studentId,
        textContent: String(fields.text_content ?? '').trim(),
        attachment,
      }
      await this.authentication.canActivate(context)
      return true
    } catch (error) {
      await this.storage.discard(stagedPath)
      if (error instanceof HttpException) throw error
      if (isMultipartLimitError(error)) {
        throw new HttpException(
          {
            ok: false,
            error: `Файл слишком большой. Максимум ${Math.round(uploadLimitMb())} МБ.`,
          },
          HttpStatus.PAYLOAD_TOO_LARGE,
        )
      }
      throw new HttpException(
        { ok: false, error: 'Не удалось отправить сообщение.' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }
}
