import { Inject, Injectable } from '@nestjs/common'
import { PortfolioStudentsRepository } from './portfolio-students.repository.js'

@Injectable()
export class ListPortfolioStudentsUseCase {
  constructor(
    @Inject(PortfolioStudentsRepository)
    private readonly students: PortfolioStudentsRepository,
  ) {}

  async execute(): Promise<object> {
    const students = await this.students.listVisibleStudents()
    return {
      ok: true,
      data: {
        students: students.map((student) => ({
          id: student.id,
          full_name: student.fullName,
          lessons_count: student.lessonsCount,
          student_track: student.studentTrack,
          metro: student.metro,
          average_rating: student.averageRating,
          works_count: student.approvedWorksCount,
          has_avatar: student.hasAvatar,
        })),
      },
    }
  }
}
