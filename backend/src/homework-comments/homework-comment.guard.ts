import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { parseHomeworkComment, type HomeworkCommentRequest } from './homework-comment.body.js'

@Injectable()
export class HomeworkCommentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<HomeworkCommentRequest>()
    request.homeworkCommentCommand = parseHomeworkComment(request.params, request.body)
    return true
  }
}
