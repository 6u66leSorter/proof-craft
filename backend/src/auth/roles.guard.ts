import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { authHttpError } from './auth.errors.js'
import type { AuthenticationRequest } from './auth.types.js'
import { REQUIRED_ROLES } from './require-roles.decorator.js'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!requiredRoles?.length) return true

    const request = context.switchToHttp().getRequest<AuthenticationRequest>()
    const actualRoles = request.authenticatedPrincipal?.user?.roles ?? []
    if (requiredRoles.some((role) => actualRoles.includes(role))) return true
    throw authHttpError(HttpStatus.FORBIDDEN, 'Недостаточно прав для выполнения операции.')
  }
}
