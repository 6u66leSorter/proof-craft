import { createReadStream, existsSync, realpathSync } from 'node:fs'
import { Readable } from 'node:stream'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { telegramApiBaseUrl } from '../notifications/telegram-user-notification.gateway.js'
import {
  FileReferenceService,
  type FileAvailability,
  type OpenedFile,
  type OpenFileOptions,
} from './file-reference.service.js'

const resolveUploadsDirectory = (): string => {
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error('Для локальных файлов требуется абсолютный SQLite DATABASE_URL.')
  }
  return join(dirname(fileURLToPath(new URL(databaseUrl))), 'uploads')
}

@Injectable()
export class LocalFileReferenceService implements FileReferenceService {
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

  async openFile(
    fileId: string | null,
    options: OpenFileOptions = {},
  ): Promise<OpenedFile | null> {
    const localPath = this.resolveLocalUpload(fileId)
    if (localPath) {
      if (options.imagePreview) {
        const preview = await this.createImagePreview(localPath)
        if (preview) return preview
      }
      return { stream: createReadStream(localPath), contentType: null }
    }

    if (!fileId || !this.isTelegramFileId(fileId)) return null
    return await this.openTelegramFile(fileId)
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

  private async createImagePreview(localPath: string): Promise<OpenedFile | null> {
    try {
      const buffer = await sharp(localPath)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer()
      return { stream: Readable.from(buffer), contentType: 'image/jpeg' }
    } catch {
      return null
    }
  }

  private async openTelegramFile(fileId: string): Promise<OpenedFile | null> {
    const token =
      process.env.BOT_TOKEN ||
      process.env.TELEGRAM_BOT_TOKEN ||
      process.env.VITE_TELEGRAM_BOT_TOKEN
    if (!token) return null

    try {
      const metadataResponse = await fetch(
        `${telegramApiBaseUrl()}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      )
      const metadata = (await metadataResponse.json().catch(() => null)) as {
        ok?: boolean
        result?: { file_path?: string }
      } | null
      const filePath = metadata?.result?.file_path
      if (!metadataResponse.ok || !metadata?.ok || !this.isSafeTelegramPath(filePath)) return null

      const encodedPath = filePath.split('/').map(encodeURIComponent).join('/')
      const fileResponse = await fetch(
        `${telegramApiBaseUrl()}/file/bot${token}/${encodedPath}`,
      )
      if (!fileResponse.ok || !fileResponse.body) return null

      return {
        stream: Readable.fromWeb(
          fileResponse.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>,
        ),
        contentType: fileResponse.headers.get('content-type'),
      }
    } catch {
      return null
    }
  }

  private isSafeTelegramPath(filePath: string | undefined): filePath is string {
    return Boolean(
      filePath &&
        !filePath.startsWith('/') &&
        !filePath.includes('\\') &&
        filePath.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
    )
  }
}
