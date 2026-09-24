import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseTeacherReview,
  type TeacherReviewRequest,
} from './teacher-review.body.js'

@Injectable()
export class TeacherReviewGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<TeacherReviewRequest>()
    request.teacherReviewCommand = parseTeacherReview(request.body)
    return true
  }
}
