import { createWriteStream, existsSync, realpathSync } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import {
  AvatarImageProcessingError,
  StudentAvatarStorage,
} from './student-avatar-storage.js'

const resolveUploadsDirectory = (): string => {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('Для локальных файлов требуется абсолютный SQLite DATABASE_URL.')
  }
  return join(dirname(fileURLToPath(new URL(databaseUrl))), 'uploads')
}

const removeIfPresent = async (path: string): Promise<void> => {
  try {
    await unlink(path)
  } catch {
    // Cleanup is best-effort; the primary operation determines the HTTP result.
  }
}

@Injectable()
export class LocalStudentAvatarStorage implements StudentAvatarStorage {
  async saveAvatar(source: Readable, studentId: number): Promise<string> {
    const uploadsDirectory = resolveUploadsDirectory()
    await mkdir(uploadsDirectory, { recursive: true })
    const uniqueId = randomUUID()
    const sourcePath = join(uploadsDirectory, `.${uniqueId}.upload`)
    const avatarPath = join(
      uploadsDirectory,
      `avatar-${studentId}-${Date.now()}-${uniqueId}.jpg`,
    )

    try {
      await pipeline(source, createWriteStream(sourcePath, { flags: 'wx' }))
    } catch (error) {
      await removeIfPresent(sourcePath)
      throw error
    }

    try {
      await sharp(sourcePath)
        .rotate()
        .resize(400, 400, { fit: 'cover' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(avatarPath)
      return avatarPath
    } catch (error) {
      await removeIfPresent(avatarPath)
      throw new AvatarImageProcessingError('Не удалось обработать изображение.', { cause: error })
    } finally {
      await removeIfPresent(sourcePath)
    }
  }

  async deleteAvatar(fileId: string | null): Promise<void> {
    const avatarPath = this.resolveLocalUpload(fileId)
    if (avatarPath) await removeIfPresent(avatarPath)
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
}
