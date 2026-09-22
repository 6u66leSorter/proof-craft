import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import {
  StudentPortfolioRepository,
  type PublicStudentPortfolio,
} from './student-portfolio.repository.js'

const PUBLIC_STUDENT_STATUS = 'studying'
const PUBLIC_HOMEWORK_STATUS = 'approved'
const PUBLIC_REVIEW_STATUS = 'approved'

@Injectable()
export class PrismaStudentPortfolioRepository implements StudentPortfolioRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FileReferenceService) private readonly files: FileReferenceService,
  ) {}

  async findVisibleByStudentId(studentId: number): Promise<PublicStudentPortfolio | null> {
    const student = await this.prisma.students.findFirst({
      where: { id: studentId, status: PUBLIC_STUDENT_STATUS },
      select: {
        id: true,
        full_name: true,
        lessons_count: true,
        student_track: true,
        metro: true,
        about_me: true,
        avatar_file_id: true,
        student_teachers: {
          orderBy: { id: 'asc' },
          select: {
            teachers: {
              select: {
                id: true,
                full_name: true,
                users: { select: { first_name: true, last_name: true } },
              },
            },
          },
        },
        homeworks: {
          where: { status: PUBLIC_HOMEWORK_STATUS },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            lesson_number: true,
            is_bonus: true,
            haircut_name: true,
            status: true,
            content_type: true,
            file_id: true,
            text_content: true,
            created_at: true,
            homework_reviews: {
              where: { status: PUBLIC_REVIEW_STATUS },
              orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
              select: {
                rating: true,
                comment: true,
                teachers: { select: { full_name: true } },
              },
            },
            homework_files: {
              orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
              select: { id: true, content_type: true, file_id: true },
            },
          },
        },
      },
    })
    if (!student) return null

    const ratings = student.homeworks.flatMap((homework) =>
      homework.homework_reviews.flatMap(({ rating }) => (rating == null ? [] : [rating])),
    )

    return {
      student: {
        id: student.id,
        fullName: student.full_name,
        lessonsCount: student.lessons_count,
        studentTrack: student.student_track || 'student',
        metro: student.metro || null,
        aboutMe: student.about_me || '',
        averageRating:
          ratings.length > 0
            ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
            : null,
        ratingsCount: ratings.length,
        hasAvatar: Boolean(student.avatar_file_id),
        teachers: student.student_teachers.map(({ teachers }) => ({
          id: teachers.id,
          fullName:
            teachers.full_name.trim() ||
            [teachers.users.first_name, teachers.users.last_name]
              .filter(Boolean)
              .join(' ')
              .trim(),
        })),
      },
      homeworks: student.homeworks.map((homework) => {
        const latestReview = homework.homework_reviews[0]
        return {
          id: homework.id,
          lessonNumber: homework.lesson_number,
          isBonus: Boolean(homework.is_bonus),
          haircutName: homework.haircut_name || null,
          status: homework.status,
          contentType: homework.content_type,
          textContent: homework.text_content,
          createdAt: homework.created_at,
          rating: latestReview?.rating == null ? null : Number(latestReview.rating),
          reviewComment: latestReview?.comment || null,
          reviewerName: latestReview?.teachers.full_name || null,
          ...this.files.getAvailability(homework.file_id),
          attachments: homework.homework_files.map((attachment) => ({
            id: attachment.id,
            contentType: attachment.content_type,
            ...this.files.getAvailability(attachment.file_id),
          })),
        }
      }),
    }
  }
}
