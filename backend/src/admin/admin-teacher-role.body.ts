import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

export type AdminTeacherRoleAction = 'assign' | 'remove'

export type ChangeAdminTeacherRoleCommand = {
  targetTelegramId: number
  action: AdminTeacherRoleAction
  fullName?: string
}

export type AdminTeacherRoleRequest = AuthenticationRequest & {
  adminTeacherRoleCommand?: ChangeAdminTeacherRoleCommand
}

export const parseAdminTeacherRole = (
  rawBody: unknown,
): ChangeAdminTeacherRoleCommand => {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return invalidParameters()
  }
  const body = rawBody as Record<string, unknown>
  const targetTelegramId = Number(body.target_telegram_id)
  if (
    !Number.isSafeInteger(targetTelegramId) ||
    targetTelegramId <= 0 ||
    !['assign', 'remove'].includes(String(body.action)) ||
    (body.full_name !== undefined && typeof body.full_name !== 'string')
  ) {
    return invalidParameters()
  }
  return {
    targetTelegramId,
    action: body.action as AdminTeacherRoleAction,
    ...(body.full_name === undefined ? {} : { fullName: body.full_name }),
  }
}

export const adminTeacherRoleCommandFrom = (
  request: AdminTeacherRoleRequest,
): ChangeAdminTeacherRoleCommand =>
  request.adminTeacherRoleCommand ?? invalidParameters()
