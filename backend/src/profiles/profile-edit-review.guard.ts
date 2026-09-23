import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import {
  parseProfileEditReview,
  type ProfileEditReviewRequest,
} from './profile-edit-review.body.js'

@Injectable()
export class ProfileEditReviewGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ProfileEditReviewRequest>()
    request.profileEditReviewCommand = parseProfileEditReview(
      request.params,
      request.body,
    )
    return true
  }
}
