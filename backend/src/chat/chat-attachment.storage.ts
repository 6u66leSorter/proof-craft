import type { Readable } from 'node:stream'

export type StagedChatAttachment = {
  path: string
  filename: string
  mimeType: string
}

export type FinalChatAttachment = {
  path: string
  mimeType: string
}

export class UnsupportedChatImageError extends Error {}

export abstract class ChatAttachmentStorage {
  abstract stage(
    source: Readable,
    filename: string,
    mimeType: string,
  ): Promise<StagedChatAttachment>
  abstract finalize(staged: StagedChatAttachment): Promise<FinalChatAttachment>
  abstract discard(path: string | null): Promise<void>
}
