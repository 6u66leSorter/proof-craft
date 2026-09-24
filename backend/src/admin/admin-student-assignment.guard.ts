import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseAdminStudentAssignment,
  type AdminStudentAssignmentRequest,
} from './admin-student-assignment.body.js'

@Injectable()
export class AdminStudentAssignmentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<AdminStudentAssignmentRequest>()
    request.adminStudentAssignmentCommand = parseAdminStudentAssignment(
      request.body,
    )
    return true
  }
}
