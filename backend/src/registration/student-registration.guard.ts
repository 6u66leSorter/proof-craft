import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseStudentRegistration,
  type StudentRegistrationRequest,
} from './student-registration.body.js'

@Injectable()
export class StudentRegistrationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StudentRegistrationRequest>()
    request.studentRegistrationCommand = parseStudentRegistration(request.body)
    return true
  }
}
