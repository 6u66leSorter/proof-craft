import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { AuthenticatedPrincipal, AuthenticationRequest } from './auth.types.js'

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticationRequest>()
    if (!request.authenticatedPrincipal) {
      throw new Error('CurrentPrincipal требует AuthenticationGuard.')
    }
    return request.authenticatedPrincipal
  },
)
