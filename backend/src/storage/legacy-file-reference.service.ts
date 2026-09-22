import { existsSync, realpathSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Injectable } from '@nestjs/common'
import { FileReferenceService, type FileAvailability } from './file-reference.service.js'

const resolveUploadsDirectory = (): string => {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('Для legacy-файлов требуется абсолютный SQLite DATABASE_URL.')
  }
  return join(dirname(fileURLToPath(new URL(databaseUrl))), 'uploads')
}

@Injectable()
export class LegacyFileReferenceService implements FileReferenceService {
  getAvailability(fileId: string | null): FileAvailability {
    const hasLocalFile = this.isLocalUpload(fileId)
    return {
      hasLocalFile,
      hasTelegramFile: !hasLocalFile && this.isTelegramFileId(fileId),
    }
  }

  private isLocalUpload(fileId: string | null): boolean {
    if (!fileId || !existsSync(fileId)) return false
    try {
      const resolvedFile = realpathSync(fileId)
      const resolvedUploads = realpathSync(resolveUploadsDirectory())
      return resolvedFile.startsWith(`${resolvedUploads}${sep}`)
    } catch {
      return false
    }
  }

  private isTelegramFileId(fileId: string | null): boolean {
    return Boolean(
      fileId &&
        !existsSync(fileId) &&
        !fileId.includes('/') &&
        !fileId.includes('\\') &&
        fileId.length > 12,
    )
  }
}
