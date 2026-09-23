import type { Readable } from 'node:stream'

export class AvatarImageProcessingError extends Error {}
export class AvatarFileTooLargeError extends Error {}

export abstract class StudentAvatarStorage {
  abstract saveAvatar(source: Readable, studentId: number): Promise<string>
  abstract deleteAvatar(fileId: string | null): Promise<void>
}
