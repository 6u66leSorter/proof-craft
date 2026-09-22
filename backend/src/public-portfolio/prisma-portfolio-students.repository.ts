import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  PortfolioStudentsRepository,
  type PublicPortfolioStudent,
} from './portfolio-students.repository.js'

type PortfolioStudentRow = {
  id: number
  full_name: string
  lessons_count: number
  student_track: string | null
  metro: string | null
  average_rating: number | null
  approved_works_count: bigint | number
  avatar_file_id: string | null
}

@Injectable()
export class PrismaPortfolioStudentsRepository implements PortfolioStudentsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listVisibleStudents(): Promise<PublicPortfolioStudent[]> {
    // Raw SQL is deliberate: Prisma cannot express SQLite's legacy COLLATE NOCASE ordering,
    // and doing the aggregates here avoids one query per student.
    const rows = await this.prisma.$queryRaw<PortfolioStudentRow[]>`
      SELECT
        s.id,
        s.full_name,
        s.lessons_count,
        s.student_track,
        s.metro,
        s.avatar_file_id,
        AVG(
          CASE
            WHEN hr.status = 'approved' AND hr.rating IS NOT NULL THEN hr.rating
            ELSE NULL
          END
        ) AS average_rating,
        COUNT(DISTINCT CASE WHEN h.status = 'approved' THEN h.id ELSE NULL END) AS approved_works_count
      FROM students s
      LEFT JOIN homeworks h ON h.student_id = s.id
      LEFT JOIN homework_reviews hr ON hr.homework_id = h.id
      WHERE s.status = 'studying'
      GROUP BY s.id
      ORDER BY s.full_name COLLATE NOCASE
    `

    return rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      lessonsCount: row.lessons_count,
      studentTrack: row.student_track || 'student',
      metro: row.metro || null,
      averageRating: row.average_rating == null ? null : Number(row.average_rating),
      approvedWorksCount: Number(row.approved_works_count),
      hasAvatar: Boolean(row.avatar_file_id),
    }))
  }
}
