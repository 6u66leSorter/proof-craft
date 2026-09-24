import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseStudentFeedback,
  type StudentFeedbackRequest,
} from './student-feedback.body.js'

@Injectable()
export class StudentFeedbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<StudentFeedbackRequest>()
    request.studentFeedbackCommand = parseStudentFeedback(request.body)
    return true
  }
}
