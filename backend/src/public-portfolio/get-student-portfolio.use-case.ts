import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { StudentPortfolioRepository } from './student-portfolio.repository.js'

@Injectable()
export class GetStudentPortfolioUseCase {
  constructor(
    @Inject(StudentPortfolioRepository)
    private readonly portfolios: StudentPortfolioRepository,
  ) {}

  async execute(studentId: number): Promise<object> {
    const portfolio = await this.portfolios.findVisibleByStudentId(studentId)
    if (!portfolio) {
      throw new HttpException(
        { ok: false, error: 'Профиль недоступен.' },
        HttpStatus.NOT_FOUND,
      )
    }

    return {
      ok: true,
      data: {
        student: {
          id: portfolio.student.id,
          full_name: portfolio.student.fullName,
          lessons_count: portfolio.student.lessonsCount,
          student_track: portfolio.student.studentTrack,
          metro: portfolio.student.metro,
          about_me: portfolio.student.aboutMe,
          average_rating: portfolio.student.averageRating,
          ratings_count: portfolio.student.ratingsCount,
          has_avatar: portfolio.student.hasAvatar,
          teachers: portfolio.student.teachers.map((teacher) => ({
            id: teacher.id,
            full_name: teacher.fullName,
          })),
        },
        homeworks: portfolio.homeworks.map((homework) => ({
          id: homework.id,
          lesson_number: homework.lessonNumber,
          is_bonus: homework.isBonus,
          haircut_name: homework.haircutName,
          status: homework.status,
          content_type: homework.contentType,
          text_content: homework.textContent,
          created_at: homework.createdAt,
          rating: homework.rating,
          review_comment: homework.reviewComment,
          reviewer_name: homework.reviewerName,
          has_local_file: homework.hasLocalFile,
          has_telegram_file: homework.hasTelegramFile,
          extra_files_count: homework.attachments.length,
          attachments: homework.attachments.map((attachment) => ({
            id: attachment.id,
            content_type: attachment.contentType,
            has_local_file: attachment.hasLocalFile,
            has_telegram_file: attachment.hasTelegramFile,
          })),
        })),
      },
    }
  }
}
