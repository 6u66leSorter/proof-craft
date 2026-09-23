import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { parseProfileEditBody, type ProfileEditRequest } from './profile-edit.body.js'

@Injectable()
export class ProfileEditGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ProfileEditRequest>()
    request.profileEditCommand = parseProfileEditBody(request.body)
    return true
  }
}
