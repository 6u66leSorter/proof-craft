import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import {
  TeacherCabinetRepository,
  type TeacherHomework,
  type TeacherHomeworkReview,
  type TeacherStudentSummary,
} from './teacher-cabinet.repository.js'
import type { TeacherStudentHomeworksQuery } from './teacher-cabinet.request.js'

const resolveTeacherId = async (
  principal: AuthenticatedPrincipal,
  repository: TeacherCabinetRepository,
): Promise<number | null> => {
  if (!principal.user) {
    throw new HttpException(
      { ok: false, error: 'Пользователь не найден.' },
      HttpStatus.NOT_FOUND,
    )
  }
  const teacherId = await repository.findTeacherIdByUserId(principal.user.id)
  if (teacherId == null && !principal.user.roles.includes('admin')) {
    throw new HttpException(
      { ok: false, error: 'Доступ только для преподавателей.' },
      HttpStatus.FORBIDDEN,
    )
  }
  return teacherId
}

const teacherResponse = (teacher: { id: number; fullName: string }) => ({
  id: teacher.id,
  full_name: teacher.fullName,
})

const reviewResponse = (review: TeacherHomeworkReview) => ({
  id: review.id,
  teacher_id: review.teacherId,
  teacher_name: review.teacherName,
  rating: review.rating,
  comment: review.comment,
  status: review.status,
  created_at: review.createdAt,
})

const homeworkResponse = (
  homework: TeacherHomework,
  files: FileReferenceService,
) => {
  const primary = files.getAvailability(homework.fileId)
  const revision = files.getAvailability(homework.revisionStudentFileId)
  const reviews = homework.reviews.map(reviewResponse)
  const attachments = homework.attachments.map((attachment) => {
    const availability = files.getAvailability(attachment.fileId)
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
    has_local_file: primary.hasLocalFile,
    has_telegram_file: primary.hasTelegramFile,
    status: homework.status,
    content_type: homework.contentType,
    file_id: homework.fileId,
    text_content: homework.textContent,
    review_count: reviews.length,
    created_at: homework.createdAt,
    revision_student_text: homework.revisionStudentText,
    revision_has_local_file: revision.hasLocalFile,
    revision_has_telegram_file: revision.hasTelegramFile,
    reviews,
    latest_review: reviews[0] ?? null,
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
}

@Injectable()
export class GetTeacherDashboardUseCase {
  constructor(
    @Inject(TeacherCabinetRepository)
    private readonly teacherCabinet: TeacherCabinetRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    const teacherId = await resolveTeacherId(principal, this.teacherCabinet)
    const source = await this.teacherCabinet.listStudents(teacherId)
    const pending = source
      .flatMap((student) => student.pendingHomeworks)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    const latest = pending[0] ?? null
    const students = source.filter((student) => student.pendingHomeworks.length > 0)
    if (teacherId != null) {
      students.sort((left, right) =>
        right.pendingHomeworks.length - left.pendingHomeworks.length ||
        left.fullName.localeCompare(right.fullName),
      )
    }

    const lastStudents: Array<{ student_id: number; student_name: string }> = []
    const seen = new Set<number>()
    for (const homework of pending) {
      if (seen.has(homework.studentId)) continue
      seen.add(homework.studentId)
      lastStudents.push({
        student_id: homework.studentId,
        student_name: homework.studentName,
      })
      if (lastStudents.length >= 3) break
    }

    return {
      ok: true,
      data: {
        pendingCount: pending.length,
        latest: latest
          ? {
              id: latest.id,
              student_id: latest.studentId,
              student_name: latest.studentName,
              lesson_number: latest.lessonNumber,
              is_bonus: latest.isBonus,
              haircut_name: latest.haircutName,
              created_at: latest.createdAt,
            }
          : null,
        students: students.map((student) => ({
          id: student.id,
          full_name: student.fullName,
          pending_count: student.pendingHomeworks.length,
          has_avatar: Boolean(student.avatarFileId),
          telegram_id: student.telegramId,
          username: student.username,
          first_name: student.firstName,
          last_name: student.lastName,
        })),
        lastStudents,
      },
    }
  }
}

@Injectable()
export class ListTeacherStudentsUseCase {
  constructor(
    @Inject(TeacherCabinetRepository)
    private readonly teacherCabinet: TeacherCabinetRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    const teacherId = await resolveTeacherId(principal, this.teacherCabinet)
    const students = await this.teacherCabinet.listStudents(teacherId)
    return {
      ok: true,
      data: {
        students: students.map((student) => ({
          id: student.id,
          full_name: student.fullName,
          lessons_count: student.lessonsCount,
          status: student.status,
          average_rating: student.averageRating,
          student_track: student.studentTrack,
          ratings_count: student.ratingsCount,
          pending_homeworks_count: student.pendingHomeworks.length,
          has_avatar: Boolean(student.avatarFileId),
          teachers: student.teachers.map(teacherResponse),
        })),
      },
    }
  }
}

@Injectable()
export class GetTeacherStudentHomeworksUseCase {
  constructor(
    @Inject(TeacherCabinetRepository)
    private readonly teacherCabinet: TeacherCabinetRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    query: TeacherStudentHomeworksQuery,
  ): Promise<object> {
    const teacherId = await resolveTeacherId(principal, this.teacherCabinet)
    const detail = await this.teacherCabinet.findStudentHomeworks(
      query.studentId,
      teacherId,
      query.includeReviewed,
    )
    if (!detail) {
      throw new HttpException(
        { ok: false, error: 'Ученик не прикреплён к этому преподавателю.' },
        HttpStatus.FORBIDDEN,
      )
    }
    return {
      ok: true,
      data: {
        student: {
          id: detail.student.id,
          full_name: detail.student.fullName,
          lessons_count: detail.student.lessonsCount,
          status: detail.student.status,
          student_track: detail.student.studentTrack,
          metro: detail.student.metro,
          about_me: detail.student.aboutMe || '',
          average_rating: detail.student.averageRating,
          ratings_count: detail.student.ratingsCount,
          has_avatar: Boolean(detail.student.avatarFileId),
          teachers: detail.student.teachers.map(teacherResponse),
        },
        homeworks: detail.homeworks.map((homework) =>
          homeworkResponse(homework, this.files),
        ),
      },
    }
  }
}
