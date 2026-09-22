import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import { SessionRepository, type SessionSnapshot } from './session.repository.js'

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getByUserId(userId: number): Promise<SessionSnapshot | null> {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        vk_user_id: true,
        user_roles: { select: { role: true }, orderBy: { role: 'asc' } },
        students: {
          include: {
            student_teachers: {
              include: {
                teachers: { include: { users: true } },
              },
            },
          },
        },
        teachers: true,
      },
    })
    if (!user) return null

    const student = user.students
    const [rating, unreadNotificationsCount] = await Promise.all([
      student
        ? this.prisma.homework_reviews.aggregate({
            where: {
              status: 'approved',
              rating: { not: null },
              homeworks: { student_id: student.id },
            },
            _avg: { rating: true },
            _count: { rating: true },
          })
        : null,
      this.prisma.app_notifications.count({
        where: { user_id: userId, read_at: null },
      }),
    ])

    return {
      roles: user.user_roles.map(({ role }) => role),
      vkAccountLinked: user.vk_user_id != null,
      student: student
        ? {
            id: student.id,
            fullName: student.full_name,
            phone: student.phone,
            lessonsCount: student.lessons_count,
            status: student.status,
            studentTrack: student.student_track || 'student',
            metro: student.metro || null,
            aboutMe: student.about_me || '',
            hasAvatar: Boolean(student.avatar_file_id),
            averageRating: rating?._avg.rating == null ? null : Number(rating._avg.rating),
            ratingsCount: rating?._count.rating ?? 0,
            teachers: student.student_teachers.map(({ teachers }) => ({
              id: teachers.id,
              fullName:
                teachers.full_name.trim().replace(/\s+/g, ' ') ||
                [teachers.users.first_name, teachers.users.last_name]
                  .filter(Boolean)
                  .join(' ')
                  .trim() ||
                'Преподаватель',
            })),
          }
        : null,
      teacher: user.teachers
        ? {
            id: user.teachers.id,
            fullName: user.teachers.full_name,
            aboutMe: user.teachers.about_me || '',
          }
        : null,
      unreadNotificationsCount,
    }
  }
}
