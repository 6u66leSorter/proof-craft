import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { parseStudentAboutBody, type StudentAboutRequest } from './student-about.body.js'

@Injectable()
export class StudentAboutGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StudentAboutRequest>()
    request.studentAboutCommand = parseStudentAboutBody(request.body)
    return true
  }
}
