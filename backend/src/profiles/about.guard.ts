import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { parseAboutBody, type AboutRequest } from './about.body.js'

@Injectable()
export class AboutGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AboutRequest>()
    request.aboutCommand = parseAboutBody(request.body)
    return true
  }
}
