/**
 * Мессенджер-независимая модель бота. Адаптер конкретного мессенджера (Telegram, MAX, …)
 * превращает свои обновления в `IncomingEvent` и реализует `ChannelPort` для ответов.
 * Сценарии работают только с этими типами.
 */

export type ChannelKind = 'telegram'

export type ChannelUser = {
  channel: ChannelKind
  /** Идентификатор пользователя в мессенджере. */
  externalId: number
  username: string | null
  firstName: string | null
  lastName: string | null
}

export type IncomingEvent =
  | { kind: 'command'; user: ChannelUser; chatId: number; command: string; args: string }
  | { kind: 'message'; user: ChannelUser; chatId: number; text: string | null }
  | { kind: 'button'; user: ChannelUser; chatId: number; data: string; callbackId: string }

export type Button = { text: string; data: string } | { text: string; url: string }

export type OutgoingMedia = {
  kind: 'photo' | 'video'
  /** Локальный путь к файлу в uploads либо идентификатор файла в мессенджере. */
  fileRef: string
  isLocalFile: boolean
}

export type OutgoingMessage = {
  text: string
  buttons?: Button[][]
  media?: OutgoingMedia
}

export interface ChannelPort {
  readonly kind: ChannelKind
  send(chatId: number, message: OutgoingMessage): Promise<void>
  /** Подтверждение нажатия кнопки; текст показывается всплывающим уведомлением. */
  answerButton(callbackId: string, text?: string): Promise<void>
}
