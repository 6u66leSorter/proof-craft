import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'
import type { StagedHomeworkFile } from './homework-submission.storage.js'

export type HomeworkRevisionCommand = {
  homeworkId: number
  fields: Record<string, string>
  /** Берётся только первый файл запроса; остальные пропускаются. */
  file: StagedHomeworkFile | null
}

export type HomeworkRevisionRequest = AuthenticationRequest & {
  params?: unknown
  homeworkRevision?: HomeworkRevisionCommand
}

export const parseHomeworkId = (rawParams: unknown): number => {
  const params = rawParams && typeof rawParams === 'object' ? (rawParams as Record<string, unknown>) : {}
  const homeworkId = Number(params.homeworkId)
  return Number.isSafeInteger(homeworkId) && homeworkId > 0 ? homeworkId : invalidParameters()
}

export const homeworkRevisionFrom = (request: HomeworkRevisionRequest): HomeworkRevisionCommand =>
  request.homeworkRevision ?? invalidParameters()
