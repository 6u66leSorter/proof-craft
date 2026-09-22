import type { Readable } from 'node:stream'

export type FileAvailability = {
  hasLocalFile: boolean
  hasTelegramFile: boolean
}

export abstract class FileReferenceService {
  abstract getAvailability(fileId: string | null): FileAvailability
  abstract openLocalFile(fileId: string | null): Readable | null
}
