import { Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { SessionRepository } from './session.repository.js'

@Injectable()
export class GetSessionUseCase {
  constructor(@Inject(SessionRepository) private readonly sessions: SessionRepository) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    const snapshot = principal.user ? await this.sessions.getByUserId(principal.user.id) : null
    const roles = snapshot?.roles ?? []
    const student = snapshot?.student ?? null
    const teacher = snapshot?.teacher ?? null
    const isAdmin = roles.includes('admin')
    const isTeacher = roles.includes('teacher')
    const primaryRole = isAdmin ? 'admin' : isTeacher ? 'teacher' : roles.includes('student') ? 'student' : null

    return {
      ok: true,
      data: {
        hasUser: Boolean(student) || isAdmin || isTeacher,
        role: primaryRole,
        roles,
        isAdmin,
        isTeacher,
        isStudent: Boolean(student),
        isGuest: Boolean(principal.user) && !student && !isAdmin && !isTeacher,
        student: student
          ? {
              id: student.id,
              full_name: student.fullName,
              phone: student.phone,
              lessons_count: student.lessonsCount,
              status: student.status,
              student_track: student.studentTrack,
              metro: student.metro,
              about_me: student.aboutMe,
              has_avatar: student.hasAvatar,
              average_rating: student.averageRating,
              ratings_count: student.ratingsCount,
              teachers: student.teachers.map((teacherItem) => ({
                id: teacherItem.id,
                full_name: teacherItem.fullName,
              })),
            }
          : null,
        teacher: teacher
          ? { id: teacher.id, full_name: teacher.fullName, about_me: teacher.aboutMe }
          : null,
        unread_notifications_count: snapshot?.unreadNotificationsCount ?? 0,
        vk_account_linked: snapshot?.vkAccountLinked ?? false,
      },
    }
  }
}
