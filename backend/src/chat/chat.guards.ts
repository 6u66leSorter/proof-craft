import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common'
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
