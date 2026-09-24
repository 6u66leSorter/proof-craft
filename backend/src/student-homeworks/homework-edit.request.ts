import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'
import type { StagedHomeworkFile } from './homework-submission.storage.js'

export type HomeworkEditCommand = {
  homeworkId: number
  fields: Record<string, string>
  files: StagedHomeworkFile[]
}

export type HomeworkEditRequest = AuthenticationRequest & {
  params?: unknown
  homeworkEdit?: HomeworkEditCommand
}

export const homeworkEditFrom = (request: HomeworkEditRequest): HomeworkEditCommand =>
  request.homeworkEdit ?? invalidParameters()

/** Legacy молча игнорирует неразбираемый JSON; берём только целые id. */
export const parseRemovedAttachmentIds = (raw: string | undefined): number[] => {
  try {
    const parsed: unknown = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : []
  } catch {
    return []
  }
}
