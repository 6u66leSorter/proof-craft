import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseAdminTeacherRole,
  type AdminTeacherRoleRequest,
} from './admin-teacher-role.body.js'

@Injectable()
export class AdminTeacherRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminTeacherRoleRequest>()
    request.adminTeacherRoleCommand = parseAdminTeacherRole(request.body)
    return true
  }
}
