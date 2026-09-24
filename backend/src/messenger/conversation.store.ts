import { Injectable } from '@nestjs/common'
import type { ChannelKind } from './channel.types.js'

export type Conversation =
  | { type: 'admin'; step: 'assignTeacherById' | 'removeTeacherById' }
  | { type: 'review'; step: 'rating' | 'comment'; homeworkId: number; action: 'approve' | 'comment'; rating: number | null }

/**
 * Незавершённые диалоги (ввод Telegram ID, оценки, комментария). Как в legacy, хранятся в памяти
 * процесса бота и теряются при перезапуске.
 */
@Injectable()
export class ConversationStore {
  private readonly conversations = new Map<string, Conversation>()

  private key(channel: ChannelKind, chatId: number): string {
    return `${channel}:${chatId}`
  }

  get(channel: ChannelKind, chatId: number): Conversation | undefined {
    return this.conversations.get(this.key(channel, chatId))
  }

  set(channel: ChannelKind, chatId: number, conversation: Conversation): void {
    this.conversations.set(this.key(channel, chatId), conversation)
  }

  delete(channel: ChannelKind, chatId: number): void {
    this.conversations.delete(this.key(channel, chatId))
  }
}
