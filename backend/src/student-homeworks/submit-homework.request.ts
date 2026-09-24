import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'
import type { StagedHomeworkFile } from './homework-submission.storage.js'

export type SubmitHomeworkCommand = {
  fields: Record<string, string>
  files: StagedHomeworkFile[]
}

export type SubmitHomeworkRequest = AuthenticationRequest & {
  homeworkSubmission?: SubmitHomeworkCommand
}

export const homeworkSubmissionFrom = (
  request: SubmitHomeworkRequest,
): SubmitHomeworkCommand => request.homeworkSubmission ?? invalidParameters()
