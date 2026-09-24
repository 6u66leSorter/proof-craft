import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseTeacherApplication,
  type TeacherApplicationRequest,
} from './teacher-application.body.js'

@Injectable()
export class TeacherApplicationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TeacherApplicationRequest>()
    request.teacherApplicationCommand = parseTeacherApplication(request.body)
    return true
  }
}
