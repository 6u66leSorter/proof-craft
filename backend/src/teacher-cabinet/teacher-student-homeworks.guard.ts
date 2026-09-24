import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseTeacherStudentHomeworksQuery,
  type TeacherCabinetRequest,
} from './teacher-cabinet.request.js'

@Injectable()
export class TeacherStudentHomeworksGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TeacherCabinetRequest>()
    request.teacherStudentHomeworksQuery = parseTeacherStudentHomeworksQuery(
      request.query,
    )
    return true
  }
}
