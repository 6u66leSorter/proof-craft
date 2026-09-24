import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseAdminStudentUpdate,
  type AdminStudentUpdateRequest,
} from './admin-student-update.body.js'

@Injectable()
export class AdminStudentUpdateGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminStudentUpdateRequest>()
    request.adminStudentUpdateCommand = parseAdminStudentUpdate(request.body)
    return true
  }
}
