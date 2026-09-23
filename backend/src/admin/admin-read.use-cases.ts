import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import {
  AdminReadRepository,
  type AdminHomework,
  type AdminHomeworkReview,
  type AdminStudent,
} from './admin-read.repository.js'
import type { AdminStudentStatus } from './admin-read.request.js'

const reviewResponse = (review: AdminHomeworkReview) => ({
  id: review.id,
  teacher_id: review.teacherId,
  teacher_name: review.teacherName,
  rating: review.rating,
  comment: review.comment,
  status: review.status,
  created_at: review.createdAt,
})

const attachmentResponse = (
  homework: AdminHomework,
  files: FileReferenceService,
) => homework.attachments.map((attachment) => {
  const availability = files.getAvailability(attachment.fileId)
  return {
    id: attachment.id,
    content_type: attachment.contentType,
    has_local_file: availability.hasLocalFile,
    has_telegram_file: availability.hasTelegramFile,
  }
})

const studentResponse = (student: AdminStudent) => ({
  id: student.id,
  user_id: student.userId,
  full_name: student.fullName,
  phone: student.phone,
  telegram_id: student.telegramId,
  username: student.username,
  first_name: student.firstName,
  last_name: student.lastName,
  lessons_count: student.lessonsCount,
  status: student.status,
  student_track: student.studentTrack,
  teachers: student.teachers.map((teacher) => ({
    id: teacher.id,
    full_name: teacher.fullName,
  })),
  teacher_ids: student.teachers.map(({ id }) => id),
  average_rating: student.averageRating,
  ratings_count: student.ratingsCount,
  pending_homeworks_count: student.pendingHomeworksCount,
  has_avatar: Boolean(student.avatarFileId),
})

const detailedHomeworkResponse = (
  homework: AdminHomework,
  files: FileReferenceService,
) => {
  const primary = files.getAvailability(homework.fileId)
  const revision = files.getAvailability(homework.revisionStudentFileId)
  const reviews = homework.reviews.map(reviewResponse)
  const attachments = attachmentResponse(homework, files)
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
export class ListAdminTeacherApplicationsUseCase {
  constructor(@Inject(AdminReadRepository) private readonly admin: AdminReadRepository) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    requireAdminPrincipal(principal)
    const applications = await this.admin.listPendingTeacherApplications()
    return {
      ok: true,
      data: {
        applications: applications.map((application) => ({
          id: application.id,
          full_name: application.fullName,
          phone: application.phone,
          telegram_id: application.telegramId,
          created_at: application.createdAt,
        })),
      },
    }
  }
}

@Injectable()
export class ListAdminFeedbackUseCase {
  constructor(@Inject(AdminReadRepository) private readonly admin: AdminReadRepository) {}

  async execute(principal: AuthenticatedPrincipal, before?: number): Promise<object> {
    requireAdminPrincipal(principal)
    const rows = await this.admin.listFeedback(before)
    return {
      ok: true,
      data: {
        items: rows.slice(0, 50).map((item) => ({
          id: item.id,
          subject: item.subject,
          message: item.message,
          created_at: item.createdAt,
          full_name: item.fullName,
        })),
        next: rows.length > 50 ? rows[49]?.id ?? null : null,
      },
    }
  }
}

@Injectable()
export class ListAdminTeachersUseCase {
  constructor(@Inject(AdminReadRepository) private readonly admin: AdminReadRepository) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    requireAdminPrincipal(principal)
    const teachers = await this.admin.listTeachers()
    return {
      ok: true,
      data: {
        teachers: teachers.map((teacher) => ({
          id: teacher.id,
          user_id: teacher.userId,
          full_name: teacher.fullName,
          phone: teacher.phone,
          telegram_id: teacher.telegramId,
          username: teacher.username,
          students_count: teacher.students.length,
          students: teacher.students.map((student) => ({
            id: student.id,
            full_name: student.fullName,
            telegram_id: student.telegramId,
            username: student.username,
          })),
        })),
      },
    }
  }
}

@Injectable()
export class ListAdminStudentsUseCase {
  constructor(@Inject(AdminReadRepository) private readonly admin: AdminReadRepository) {}

  async execute(
    principal: AuthenticatedPrincipal,
    status: AdminStudentStatus,
  ): Promise<object> {
    requireAdminPrincipal(principal)
    const students = await this.admin.listStudents(status)
    return { ok: true, data: { students: students.map(studentResponse) } }
  }
}

@Injectable()
export class GetAdminStudentUseCase {
  constructor(
    @Inject(AdminReadRepository) private readonly admin: AdminReadRepository,
    @Inject(FileReferenceService) private readonly files: FileReferenceService,
  ) {}

  async execute(principal: AuthenticatedPrincipal, studentId: number): Promise<object> {
    requireAdminPrincipal(principal)
    const detail = await this.admin.findStudent(studentId)
    if (!detail) {
      throw new HttpException(
        { ok: false, error: 'Ученик не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }
    return {
      ok: true,
      data: {
        student: {
          ...studentResponse(detail.student),
          metro: detail.student.metro,
          about_me: detail.student.aboutMe || '',
        },
        homeworks: detail.homeworks.map((homework) =>
          detailedHomeworkResponse(homework, this.files),
        ),
      },
    }
  }
}

@Injectable()
export class ListAdminHomeworksUseCase {
  constructor(
    @Inject(AdminReadRepository) private readonly admin: AdminReadRepository,
    @Inject(FileReferenceService) private readonly files: FileReferenceService,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    studentId: number | null,
  ): Promise<object> {
    requireAdminPrincipal(principal)
    const homeworks = await this.admin.listHomeworks(studentId)
    return {
      ok: true,
      data: {
        homeworks: homeworks.map((homework) => {
          const primary = this.files.getAvailability(homework.fileId)
          const attachments = attachmentResponse(homework, this.files)
          return {
            id: homework.id,
            student_id: homework.studentId,
            ...(studentId == null ? { student_name: homework.studentName } : {}),
            lesson_number: homework.lessonNumber,
            is_bonus: homework.isBonus,
            haircut_name: homework.haircutName,
            has_local_file: primary.hasLocalFile,
            has_telegram_file: primary.hasTelegramFile,
            status: homework.status,
            content_type: homework.contentType,
            file_id: homework.fileId,
            text_content: homework.textContent,
            created_at: homework.createdAt,
            extra_files_count: attachments.length,
            attachments,
            reviews: homework.reviews.map(reviewResponse),
          }
        }),
      },
    }
  }
}

@Injectable()
export class ListAdminAuditUseCase {
  constructor(@Inject(AdminReadRepository) private readonly admin: AdminReadRepository) {}

  async execute(principal: AuthenticatedPrincipal, limit: number): Promise<object> {
    requireAdminPrincipal(principal)
    const entries = await this.admin.listAudit(limit)
    return {
      ok: true,
      data: {
        entries: entries.map((entry) => ({
          id: entry.id,
          action: entry.action,
          meta: entry.meta,
          created_at: entry.createdAt,
          actor_user_id: entry.actorUserId,
          actor_telegram_id: entry.actorTelegramId,
        })),
      },
    }
  }
}
