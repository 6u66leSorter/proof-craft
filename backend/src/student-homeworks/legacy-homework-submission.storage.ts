import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, unlink } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import {
  HomeworkSubmissionStorage,
  type FinalHomeworkFile,
  type StagedHomeworkFile,
  UnsupportedHomeworkImageError,
} from './homework-submission.storage.js'

const uploadsDirectory = (): string => {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('Для legacy-файлов требуется абсолютный SQLite DATABASE_URL.')
  }
  return join(dirname(fileURLToPath(new URL(databaseUrl))), 'uploads')
}

const safeExtension = (filename: string): string => {
  const extension = extname(filename).toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ''
}

const isImage = (file: StagedHomeworkFile): boolean =>
  file.mimeType.toLowerCase().startsWith('image/') ||
  ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(
    safeExtension(file.filename),
  )

const isHeic = (file: StagedHomeworkFile): boolean =>
  ['image/heic', 'image/heif'].includes(file.mimeType.toLowerCase()) ||
  ['.heic', '.heif'].includes(safeExtension(file.filename))

@Injectable()
export class LegacyHomeworkSubmissionStorage implements HomeworkSubmissionStorage {
  async stage(
    source: Readable,
    filename: string,
    mimeType: string,
  ): Promise<StagedHomeworkFile> {
    const directory = uploadsDirectory()
    await mkdir(directory, { recursive: true })
    const path = join(directory, `.${randomUUID()}.homework-upload`)
    try {
      await pipeline(source, createWriteStream(path, { flags: 'wx' }))
      return { path, filename, mimeType }
    } catch (error) {
      await this.discard(path)
      throw error
    }
  }

  async finalize(staged: StagedHomeworkFile): Promise<FinalHomeworkFile> {
    const directory = uploadsDirectory()
    const id = `${Date.now()}-${randomUUID()}`
    if (isImage(staged)) {
      const imagePath = join(directory, `homework-${id}.jpg`)
      try {
        await sharp(staged.path)
          .rotate()
          .jpeg({ quality: 92, mozjpeg: true })
          .toFile(imagePath)
        await this.discard(staged.path)
        return { path: imagePath, mimeType: 'image/jpeg' }
      } catch (error) {
        await this.discard(imagePath)
        if (isHeic(staged)) {
          await this.discard(staged.path)
          throw new UnsupportedHomeworkImageError('HEIC/HEIF не поддерживается.', {
            cause: error,
          })
        }
      }
    }
    const path = join(directory, `homework-${id}${safeExtension(staged.filename)}`)
    await rename(staged.path, path)
    return { path, mimeType: staged.mimeType }
  }

  async discard(path: string | null): Promise<void> {
    if (!path) return
    try {
      await unlink(path)
    } catch {
      // Cleanup is best-effort; the primary operation determines the response.
    }
  }
}
