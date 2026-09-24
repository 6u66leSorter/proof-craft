import type { Readable } from 'node:stream'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { contentTypeToMime } from '../storage/content-type-to-mime.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { ChatAccessPolicy } from './chat-access.policy.js'
import { ChatRepository } from './chat.repository.js'

export type ChatMessageFileResponse = {
  stream: Readable
  contentType: string
}

@Injectable()
export class GetChatMessageFileUseCase {
  constructor(
    @Inject(ChatRepository) private readonly chats: ChatRepository,
    @Inject(ChatAccessPolicy) private readonly access: ChatAccessPolicy,
    @Inject(FileReferenceService) private readonly files: FileReferenceService,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    messageId: number,
  ): Promise<ChatMessageFileResponse> {
    const user = this.access.requireUser(principal)
    const message = await this.chats.findMessage(messageId)
    if (!message) {
      throw new HttpException(
        { ok: false, error: 'Сообщение не найдено.' },
        HttpStatus.NOT_FOUND,
      )
    }
    const studentAccess = await this.chats.findStudentAccess(message.studentId, user.id)
    this.access.assertStudentAccess(
      user,
      studentAccess,
      'Нет доступа к этому вложению.',
    )
    if (!message.fileId || !['photo', 'video', 'document'].includes(message.contentType)) {
      return this.unavailable()
    }
    const file = await this.files.openFile(message.fileId)
    if (!file) return this.unavailable()
    return {
      stream: file.stream,
      contentType: file.contentType || contentTypeToMime(message.contentType),
    }
  }

  private unavailable(): never {
    throw new HttpException(
      { ok: false, error: 'Вложение недоступно.' },
      HttpStatus.NOT_FOUND,
    )
  }
}
