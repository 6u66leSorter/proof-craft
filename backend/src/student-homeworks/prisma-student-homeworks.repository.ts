import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  StudentHomeworksRepository,
  type CreateHomeworkSubmissionCommand,
  type CreateHomeworkSubmissionResult,
  type HomeworkSubmissionStudent,
  type StudentHomework,
  type StudentHomeworksSnapshot,
  type EditPendingHomeworkCommand,
  type EditPendingHomeworkResult,
  type RawHomeworkRow,
  type SubmitRevisionCommand,
  type SubmitRevisionResult,
} from './student-homeworks.repository.js'

const compareHomeworks = (left: StudentHomework, right: StudentHomework): number => {
  const leftPriority = left.status === 'pending' ? 0 : 1
  const rightPriority = right.status === 'pending' ? 0 : 1
  if (leftPriority !== rightPriority) return leftPriority - rightPriority
  return right.createdAt.localeCompare(left.createdAt)
}

@Injectable()
export class PrismaStudentHomeworksRepository implements StudentHomeworksRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: number): Promise<StudentHomeworksSnapshot | null> {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      select: {
        homeworks: {
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            student_id: true,
            lesson_number: true,
            is_bonus: true,
            haircut_name: true,
            status: true,
            content_type: true,
            file_id: true,
            text_content: true,
            created_at: true,
            revision_student_text: true,
            revision_student_file_id: true,
            homework_reviews: {
              orderBy: { created_at: 'desc' },
              select: {
                id: true,
                teacher_id: true,
                rating: true,
                comment: true,
                status: true,
                created_at: true,
                teachers: { select: { full_name: true } },
              },
            },
            homework_comments: {
              orderBy: { id: 'asc' },
              select: {
                id: true,
                author_user_id: true,
                text_content: true,
                created_at: true,
                users: {
                  select: {
                    first_name: true,
                    last_name: true,
                    username: true,
                    teachers: { select: { id: true } },
                    students: { select: { id: true } },
                  },
                },
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

    const homeworks: StudentHomework[] = student.homeworks.map((homework) => ({
      id: homework.id,
      studentId: homework.student_id,
      lessonNumber: homework.lesson_number,
      isBonus: Boolean(homework.is_bonus),
      haircutName: homework.haircut_name || null,
      status: homework.status,
      contentType: homework.content_type,
      fileId: homework.file_id,
      textContent: homework.text_content,
      createdAt: homework.created_at,
      revisionStudentText: homework.revision_student_text,
      revisionStudentFileId: homework.revision_student_file_id,
      reviews: homework.homework_reviews.map((review) => ({
        id: review.id,
        teacherId: review.teacher_id,
        teacherName: review.teachers.full_name,
        rating: review.rating == null ? null : Number(review.rating),
        comment: review.comment,
        status: review.status,
        createdAt: review.created_at,
      })),
      comments: homework.homework_comments.map((comment) => {
        const fullName = [comment.users.first_name, comment.users.last_name]
          .filter(Boolean)
          .join(' ')
          .trim()
        return {
          id: comment.id,
          authorUserId: comment.author_user_id,
          authorName: fullName || comment.users.username || 'Пользователь',
          authorRole: comment.users.teachers
            ? 'teacher'
            : comment.users.students
              ? 'student'
              : 'admin',
          textContent: comment.text_content,
          createdAt: comment.created_at,
        }
      }),
      attachments: homework.homework_files.map((attachment) => ({
        id: attachment.id,
        contentType: attachment.content_type,
        fileId: attachment.file_id,
      })),
    }))
    homeworks.sort(compareHomeworks)

    const ratings = homeworks.flatMap((homework) =>
      homework.reviews.flatMap((review) =>
        review.status === 'approved' && review.rating != null ? [review.rating] : [],
      ),
    )
    return {
      homeworks,
      averageRating:
        ratings.length > 0
          ? ratings.reduce((total, rating) => total + rating, 0) / ratings.length
          : null,
      ratingsCount: ratings.length,
    }
  }

  async findSubmissionStudent(userId: number): Promise<HomeworkSubmissionStudent | null> {
    const [student, admins] = await Promise.all([
      this.prisma.students.findUnique({
        where: { user_id: userId },
        select: {
          id: true,
          full_name: true,
          lessons_count: true,
          status: true,
          student_teachers: {
            select: {
              teachers: {
                select: { user_id: true, users: { select: { telegram_id: true } } },
              },
            },
          },
        },
      }),
      this.prisma.users.findMany({
        where: { user_roles: { some: { role: 'admin' } } },
        select: { id: true, telegram_id: true },
      }),
    ])
    if (!student) return null
    return {
      id: student.id,
      fullName: student.full_name,
      lessonsCount: student.lessons_count,
      status: student.status,
      teachers: student.student_teachers.map(({ teachers }) => ({
        userId: teachers.user_id,
        telegramId: Number(teachers.users.telegram_id),
      })),
      admins: admins.map((admin) => ({
        userId: admin.id,
        telegramId: Number(admin.telegram_id),
      })),
    }
  }

  async hasPendingSubmission(
    studentId: number,
    lessonNumber: number | null,
    isBonus: boolean,
  ): Promise<boolean> {
    return Boolean(await this.prisma.homeworks.findFirst({
      where: {
        student_id: studentId,
        status: 'pending',
        is_bonus: isBonus ? 1 : 0,
        ...(isBonus ? {} : { lesson_number: lessonNumber }),
      },
      select: { id: true },
    }))
  }

  async createSubmission(
    command: CreateHomeworkSubmissionCommand,
  ): Promise<CreateHomeworkSubmissionResult> {
    return await this.prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.homeworks.findFirst({
        where: {
          student_id: command.studentId,
          status: 'pending',
          is_bonus: command.isBonus ? 1 : 0,
          ...(command.isBonus ? {} : { lesson_number: command.lessonNumber }),
        },
        select: { id: true },
      })
      if (duplicate) return { kind: 'duplicate' } as const

      const primary = command.files[0] ?? null
      const created = await transaction.homeworks.create({
        data: {
          student_id: command.studentId,
          lesson_number: command.isBonus ? null : command.lessonNumber,
          is_bonus: command.isBonus ? 1 : 0,
          content_type: primary?.contentType ?? 'text',
          file_id: primary?.fileId ?? null,
          text_content: command.textContent,
          status: 'pending',
          haircut_name: command.haircutName,
        },
        select: { id: true },
      })
      for (const [index, file] of command.files.slice(1).entries()) {
        await transaction.homework_files.create({
          data: {
            homework_id: created.id,
            file_id: file.fileId,
            content_type: file.contentType,
            sort_order: index + 1,
          },
        })
      }
      const payload = JSON.stringify({
        student_id: command.studentId,
        homework_id: created.id,
      })
      for (const userId of command.teacherUserIds) {
        await transaction.app_notifications.create({
          data: {
            user_id: userId,
            kind: 'new_homework',
            body: command.teacherNotificationBody,
            payload,
          },
        })
      }
      for (const userId of command.adminUserIds) {
        await transaction.app_notifications.create({
          data: {
            user_id: userId,
            kind: 'new_homework',
            body: command.adminNotificationBody,
            payload,
          },
        })
      }
      const homework = await transaction.homeworks.findUniqueOrThrow({
        where: { id: created.id },
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
          homework_files: {
            orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
            select: { id: true, content_type: true, file_id: true },
          },
        },
      })
      return {
        kind: 'created',
        homework: {
          id: homework.id,
          lessonNumber: homework.lesson_number,
          isBonus: Boolean(homework.is_bonus),
          haircutName: homework.haircut_name,
          status: homework.status,
          contentType: homework.content_type,
          fileId: homework.file_id,
          textContent: homework.text_content,
          createdAt: homework.created_at,
          attachments: homework.homework_files.map((file) => ({
            id: file.id,
            contentType: file.content_type,
            fileId: file.file_id,
          })),
        },
      }
    })
  }

  async submitRevision(command: SubmitRevisionCommand): Promise<SubmitRevisionResult> {
    return await this.prisma.$transaction(async (transaction) => {
      const homework = await transaction.homeworks.findUnique({
        where: { id: command.homeworkId },
        select: { student_id: true, status: true },
      })
      if (!homework || homework.student_id !== command.studentId) return 'not_found'
      if (homework.status !== 'revision') return 'not_revision'
      if (!command.text) return 'no_text'
      await transaction.homeworks.update({
        where: { id: command.homeworkId },
        data: {
          revision_student_text: command.text,
          ...(command.revisionFileId ? { revision_student_file_id: command.revisionFileId } : {}),
          status: 'pending',
          updated_at: command.updatedAt,
        },
      })
      if (command.recipientUserIds.length) {
        await transaction.app_notifications.createMany({
          data: command.recipientUserIds.map((userId) => ({
            user_id: userId,
            kind: 'homework_revision',
            body: command.notificationBody,
            payload: JSON.stringify({ student_id: command.studentId, homework_id: command.homeworkId }),
            created_at: command.updatedAt,
          })),
        })
      }
      return 'submitted'
    })
  }

  async findHomeworkOwner(homeworkId: number): Promise<{ studentId: number; status: string } | null> {
    const homework = await this.prisma.homeworks.findUnique({
      where: { id: homeworkId },
      select: { student_id: true, status: true },
    })
    return homework ? { studentId: homework.student_id, status: homework.status } : null
  }

  async editPendingHomework(command: EditPendingHomeworkCommand): Promise<EditPendingHomeworkResult> {
    return await this.prisma.$transaction(async (transaction) => {
      const homework = await transaction.homeworks.findUnique({
        where: { id: command.homeworkId },
        select: { student_id: true, status: true },
      })
      if (!homework || homework.student_id !== command.studentId) return 'not_found'
      if (homework.status !== 'pending') return 'not_pending'
      await transaction.homeworks.update({
        where: { id: command.homeworkId },
        data: {
          updated_at: command.updatedAt,
          ...(command.textContent !== undefined ? { text_content: command.textContent || null } : {}),
          ...(command.haircutName !== undefined ? { haircut_name: command.haircutName || null } : {}),
          ...(command.removePrimary ? { file_id: null } : {}),
        },
      })
      if (command.removeAttachmentIds.length) {
        await transaction.homework_files.deleteMany({
          where: { homework_id: command.homeworkId, id: { in: command.removeAttachmentIds } },
        })
      }
      if (command.newAttachments.length) {
        const { _max } = await transaction.homework_files.aggregate({
          where: { homework_id: command.homeworkId },
          _max: { sort_order: true },
        })
        const maxOrder = _max.sort_order ?? 0
        await transaction.homework_files.createMany({
          data: command.newAttachments.map((file, index) => ({
            homework_id: command.homeworkId,
            file_id: file.fileId,
            content_type: file.contentType,
            sort_order: maxOrder + index + 1,
            created_at: command.updatedAt,
          })),
        })
      }
      return 'edited'
    })
  }

  async findRawHomework(homeworkId: number): Promise<RawHomeworkRow | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT h.*,
              s.full_name AS student_name,
              s.user_id AS student_user_id,
              u.telegram_id AS student_telegram_id
       FROM homeworks h
       JOIN students s ON h.student_id = s.id
       JOIN users u ON s.user_id = u.id
       WHERE h.id = ?`,
      homeworkId,
    )
    const row = rows[0]
    if (!row) return null
    // SQLite INTEGER приходит как BigInt у больших значений (telegram_id); в ответе API — числа.
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value]),
    ) as RawHomeworkRow
  }

  async listAttachments(homeworkId: number): Promise<Array<{ id: number; contentType: string; fileId: string }>> {
    const rows = await this.prisma.homework_files.findMany({
      where: { homework_id: homeworkId },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      select: { id: true, content_type: true, file_id: true },
    })
    return rows.map((row) => ({ id: row.id, contentType: row.content_type, fileId: row.file_id }))
  }
}
