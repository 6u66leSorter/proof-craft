import { createReadStream, existsSync, realpathSync } from 'node:fs'
import type { Readable } from 'node:stream'
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
    const hasLocalFile = this.resolveLocalUpload(fileId) != null
    return {
      hasLocalFile,
      hasTelegramFile: !hasLocalFile && this.isTelegramFileId(fileId),
    }
  }

  openLocalFile(fileId: string | null): Readable | null {
    const resolvedPath = this.resolveLocalUpload(fileId)
    return resolvedPath ? createReadStream(resolvedPath) : null
  }

  private resolveLocalUpload(fileId: string | null): string | null {
    if (!fileId || !existsSync(fileId)) return null
    try {
      const resolvedFile = realpathSync(fileId)
      const resolvedUploads = realpathSync(resolveUploadsDirectory())
      return resolvedFile.startsWith(`${resolvedUploads}${sep}`) ? resolvedFile : null
    } catch {
      return null
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
