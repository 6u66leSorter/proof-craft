import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  PortfolioStudentsRepository,
  type PublicPortfolioStudent,
} from './portfolio-students.repository.js'

const PUBLIC_STUDENT_STATUS = 'studying'
const PUBLIC_HOMEWORK_STATUS = 'approved'
const PUBLIC_REVIEW_STATUS = 'approved'

const publicNameCollator = new Intl.Collator('ru-RU', {
  usage: 'sort',
  sensitivity: 'base',
})

@Injectable()
export class PrismaPortfolioStudentsRepository implements PortfolioStudentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listVisibleStudents(): Promise<PublicPortfolioStudent[]> {
    const rows = await this.prisma.students.findMany({
      where: { status: PUBLIC_STUDENT_STATUS },
      select: {
        id: true,
        full_name: true,
        lessons_count: true,
        student_track: true,
        metro: true,
        avatar_file_id: true,
        homeworks: {
          where: { status: PUBLIC_HOMEWORK_STATUS },
          select: {
            homework_reviews: {
              where: {
                status: PUBLIC_REVIEW_STATUS,
                rating: { not: null },
              },
              select: { rating: true },
            },
          },
        },
      },
    })

    return rows
      .map((row) => {
        const ratings = row.homeworks.flatMap((homework) =>
          homework.homework_reviews.flatMap(({ rating }) => (rating == null ? [] : [rating])),
        )
        return {
          id: row.id,
          fullName: row.full_name,
          lessonsCount: row.lessons_count,
          studentTrack: row.student_track || 'student',
          metro: row.metro || null,
          averageRating:
            ratings.length > 0
              ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
              : null,
          approvedWorksCount: row.homeworks.length,
          hasAvatar: Boolean(row.avatar_file_id),
        }
      })
      .sort(
        (left, right) =>
          publicNameCollator.compare(left.fullName, right.fullName) || left.id - right.id,
      )
  }
}
