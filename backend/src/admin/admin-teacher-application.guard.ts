import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseAdminTeacherApplication,
  type AdminTeacherApplicationRequest,
} from './admin-teacher-application.body.js'

@Injectable()
export class AdminTeacherApplicationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminTeacherApplicationRequest>()
    request.adminTeacherApplicationCommand = parseAdminTeacherApplication(
      request.body,
    )
    return true
  }
}
