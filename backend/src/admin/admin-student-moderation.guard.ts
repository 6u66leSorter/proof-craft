import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseAdminStudentModeration,
  type AdminStudentModerationRequest,
} from './admin-student-moderation.body.js'

@Injectable()
export class AdminStudentModerationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminStudentModerationRequest>()
    request.adminStudentModerationCommand = parseAdminStudentModeration(
      request.body,
    )
    return true
  }
}
