import { SetMetadata } from '@nestjs/common'

export const REQUIRED_ROLES = 'required_roles'
export const RequireRoles = (...roles: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles)
