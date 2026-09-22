import type { Readable } from 'node:stream'

export type FileAvailability = {
  hasLocalFile: boolean
  hasTelegramFile: boolean
}

export type OpenedFile = {
  stream: Readable
  contentType: string | null
}

export type OpenFileOptions = {
  imagePreview?: boolean
}

export abstract class FileReferenceService {
  abstract getAvailability(fileId: string | null): FileAvailability
  abstract openLocalFile(fileId: string | null): Readable | null
  abstract openFile(fileId: string | null, options?: OpenFileOptions): Promise<OpenedFile | null>
}
