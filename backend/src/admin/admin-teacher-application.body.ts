import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type AdminTeacherApplicationAction = 'approve' | 'reject'

export type DecideAdminTeacherApplicationCommand = {
  applicationId: number
  action: AdminTeacherApplicationAction
}

export type AdminTeacherApplicationRequest = AuthenticationRequest & {
  adminTeacherApplicationCommand?: DecideAdminTeacherApplicationCommand
}

export const parseAdminTeacherApplication = (
  rawBody: unknown,
): DecideAdminTeacherApplicationCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  const applicationId = Number(body.application_id)
  if (
    !Number.isSafeInteger(applicationId) ||
    applicationId <= 0 ||
    !['approve', 'reject'].includes(String(body.action))
  ) {
    return invalidParameters()
  }
  return {
    applicationId,
    action: body.action as AdminTeacherApplicationAction,
  }
}

export const adminTeacherApplicationCommandFrom = (
  request: AdminTeacherApplicationRequest,
): DecideAdminTeacherApplicationCommand =>
  request.adminTeacherApplicationCommand ?? invalidParameters()
