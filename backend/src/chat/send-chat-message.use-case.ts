import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { ChatAccessPolicy } from './chat-access.policy.js'
import {
  ChatAttachmentStorage,
  UnsupportedChatImageError,
} from './chat-attachment.storage.js'
import { mapChatMessage } from './chat-message.mapper.js'
import { ChatRepository, type ChatMessageTarget } from './chat.repository.js'
import type { ChatMessageCommand } from './chat.request.js'

@Injectable()
export class SendChatMessageUseCase {
  constructor(
    @Inject(ChatRepository)
    private readonly chats: ChatRepository,
    @Inject(ChatAccessPolicy)
    private readonly access: ChatAccessPolicy,
    @Inject(ChatAttachmentStorage)
    private readonly storage: ChatAttachmentStorage,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: ChatMessageCommand,
  ): Promise<object> {
    const user = this.access.requireUser(principal)
    const target = await this.chats.findMessageTarget(command.studentId, user.id)
    this.access.assertStudentAccess(
      user,
      target,
      'Нет доступа к чату этого ученика.',
    )
    if (!command.textContent && !command.attachment) {
      throw new HttpException(
        { ok: false, error: 'Добавьте текст или вложение.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    let finalPath: string | null = null
    try {
      const attachment = command.attachment
        ? await this.storage.finalize(command.attachment)
        : null
      finalPath = attachment?.path ?? null
      const message = await this.chats.createMessage({
        studentId: command.studentId,
        senderUserId: user.id,
        textContent: command.textContent || null,
        contentType: attachment ? this.contentType(attachment.mimeType) : 'text',
        fileId: finalPath,
        notifications: this.notifications(target!, user.roles),
      })
      return { ok: true, data: { message: mapChatMessage(message) } }
    } catch (error) {
      await this.storage.discard(finalPath)
      if (error instanceof HttpException) throw error
      if (error instanceof UnsupportedChatImageError) {
        throw new HttpException(
          {
            ok: false,
            error: 'Формат HEIC/HEIF не поддерживается. Сохраните фото как JPG и загрузите снова.',
          },
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        )
      }
      throw new HttpException(
        { ok: false, error: 'Не удалось отправить сообщение.' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }
  }

  private contentType(mimeType: string): string {
    if (mimeType.toLowerCase().startsWith('image/')) return 'photo'
    if (mimeType.toLowerCase().startsWith('video/')) return 'video'
    return 'document'
  }

  private notifications(
    target: ChatMessageTarget,
    senderRoles: string[],
  ): Array<{ userId: number; body: string }> {
    if (target.senderStudentId === target.studentId) {
      return target.assignedTeacherUserIds.map((userId) => ({
        userId,
        body: `В чате ученика ${target.studentFullName} новое сообщение.`,
      }))
    }
    if (target.senderStudentId == null && senderRoles.includes('teacher')) {
      return [{
        userId: target.studentUserId,
        body: `Новое сообщение в вашем чате от ${
          senderRoles.includes('admin') ? 'администратора' : 'преподавателя'
        }.`,
      }]
    }
    if (target.senderStudentId == null && senderRoles.includes('admin')) {
      return [{
        userId: target.studentUserId,
        body: 'Новое сообщение в вашем чате от администратора.',
      }]
    }
    return []
  }
}
