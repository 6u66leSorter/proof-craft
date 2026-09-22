export type FileAvailability = {
  hasLocalFile: boolean
  hasTelegramFile: boolean
}

export abstract class FileReferenceService {
  abstract getAvailability(fileId: string | null): FileAvailability
}
