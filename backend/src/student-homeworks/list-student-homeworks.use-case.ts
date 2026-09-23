import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import {
  StudentHomeworksRepository,
  type StudentHomeworkReview,
} from './student-homeworks.repository.js'

const reviewResponse = (review: StudentHomeworkReview) => ({
  id: review.id,
  teacher_id: review.teacherId,
  teacher_name: review.teacherName,
  rating: review.rating,
  comment: review.comment,
  status: review.status,
  created_at: review.createdAt,
})

@Injectable()
export class ListStudentHomeworksUseCase {
  constructor(
    @Inject(StudentHomeworksRepository)
    private readonly studentHomeworks: StudentHomeworksRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    const snapshot = principal.user
      ? await this.studentHomeworks.findByUserId(principal.user.id)
      : null
    if (!snapshot) {
      throw new HttpException(
        { ok: false, error: 'Ученик не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    return {
      ok: true,
      data: {
        homeworks: snapshot.homeworks.map((homework) => {
          const primaryFile = this.files.getAvailability(homework.fileId)
          const revisionFile = this.files.getAvailability(homework.revisionStudentFileId)
          const reviews = homework.reviews.map(reviewResponse)
          const attachments = homework.attachments.map((attachment) => {
            const availability = this.files.getAvailability(attachment.fileId)
            return {
              id: attachment.id,
              content_type: attachment.contentType,
              has_local_file: availability.hasLocalFile,
              has_telegram_file: availability.hasTelegramFile,
            }
          })
          return {
            id: homework.id,
            student_id: homework.studentId,
            lesson_number: homework.lessonNumber,
            is_bonus: homework.isBonus,
            haircut_name: homework.haircutName,
            has_local_file: primaryFile.hasLocalFile,
            has_telegram_file: primaryFile.hasTelegramFile,
            status: homework.status,
            content_type: homework.contentType,
            file_id: homework.fileId,
            text_content: homework.textContent,
            review_count: reviews.length,
            created_at: homework.createdAt,
            revision_student_text: homework.revisionStudentText,
            revision_has_local_file: revisionFile.hasLocalFile,
            revision_has_telegram_file: revisionFile.hasTelegramFile,
            reviews,
            latest_review: reviews[0] || null,
            comments: homework.comments.map((comment) => ({
              id: comment.id,
              author_user_id: comment.authorUserId,
              author_name: comment.authorName,
              author_role: comment.authorRole,
              text_content: comment.textContent,
              created_at: comment.createdAt,
            })),
            extra_files_count: attachments.length,
            attachments,
          }
        }),
        average_rating: snapshot.averageRating,
        ratings_count: snapshot.ratingsCount,
      },
    }
  }
}
