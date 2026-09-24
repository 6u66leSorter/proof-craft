import type { Readable } from 'node:stream'

export type StagedHomeworkFile = {
  path: string
  filename: string
  mimeType: string
}

export type FinalHomeworkFile = {
  path: string
  mimeType: string
}

export class UnsupportedHomeworkImageError extends Error {}

export abstract class HomeworkSubmissionStorage {
  abstract stage(
    source: Readable,
    filename: string,
    mimeType: string,
  ): Promise<StagedHomeworkFile>
  abstract finalize(staged: StagedHomeworkFile): Promise<FinalHomeworkFile>
  abstract discard(path: string | null): Promise<void>
}
