import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  TeacherCabinetRepository,
  type SaveTeacherReviewCommand,
  type TeacherHomework,
  type TeacherReviewTarget,
  type TeacherStudentHomeworks,
  type TeacherStudentSummary,
} from './teacher-cabinet.repository.js'

const summarySelect = {
  id: true,
  full_name: true,
  lessons_count: true,
  status: true,
  student_track: true,
  metro: true,
  about_me: true,
  avatar_file_id: true,
  users: {
    select: {
      telegram_id: true,
      username: true,
      first_name: true,
      last_name: true,
    },
  },
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
    select: {
      id: true,
      student_id: true,
      lesson_number: true,
      is_bonus: true,
      haircut_name: true,
      status: true,
      created_at: true,
      homework_reviews: {
        where: { status: 'approved', rating: { not: null } },
        select: { rating: true },
      },
    },
  },
} satisfies Prisma.studentsSelect

type SummaryRow = Prisma.studentsGetPayload<{ select: typeof summarySelect }>

const homeworkSelect = {
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
} satisfies Prisma.homeworksSelect

type HomeworkRow = Prisma.homeworksGetPayload<{ select: typeof homeworkSelect }>

const teacherName = (
  relation: SummaryRow['student_teachers'][number]['teachers'],
): string =>
  relation.full_name.trim() ||
  [relation.users.first_name, relation.users.last_name].filter(Boolean).join(' ').trim()

const mapSummary = (student: SummaryRow): TeacherStudentSummary => {
  const ratings = student.homeworks.flatMap((homework) =>
    homework.homework_reviews.flatMap(({ rating }) =>
      rating == null ? [] : [Number(rating)],
    ),
  )
  return {
    id: student.id,
    fullName: student.full_name,
    lessonsCount: student.lessons_count,
    status: student.status,
    studentTrack: student.student_track || 'student',
    metro: student.metro,
    aboutMe: student.about_me,
    avatarFileId: student.avatar_file_id,
    telegramId: Number(student.users.telegram_id),
    username: student.users.username,
    firstName: student.users.first_name,
    lastName: student.users.last_name,
    teachers: student.student_teachers.map(({ teachers }) => ({
      id: teachers.id,
      fullName: teacherName(teachers),
    })),
    averageRating:
      ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : null,
    ratingsCount: ratings.length,
    pendingHomeworks: student.homeworks
      .filter(({ status }) => status === 'pending')
      .map((homework) => ({
        id: homework.id,
        studentId: student.id,
        studentName: student.full_name,
        lessonNumber: homework.lesson_number,
        isBonus: Boolean(homework.is_bonus),
        haircutName: homework.haircut_name,
        createdAt: homework.created_at,
      })),
  }
}

const mapHomework = (homework: HomeworkRow): TeacherHomework => ({
  id: homework.id,
  studentId: homework.student_id,
  lessonNumber: homework.lesson_number,
  isBonus: Boolean(homework.is_bonus),
  haircutName: homework.haircut_name,
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
  attachments: homework.homework_files.map((file) => ({
    id: file.id,
    contentType: file.content_type,
    fileId: file.file_id,
  })),
})

@Injectable()
export class PrismaTeacherCabinetRepository implements TeacherCabinetRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findTeacherIdByUserId(userId: number): Promise<number | null> {
    const teacher = await this.prisma.teachers.findUnique({
      where: { user_id: userId },
      select: { id: true },
    })
    return teacher?.id ?? null
  }

  async ensureTeacherForUser(userId: number): Promise<number> {
    const user = await this.prisma.users.findUniqueOrThrow({
      where: { id: userId },
      select: { first_name: true, last_name: true, username: true },
    })
    const fullName =
      [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
      user.username ||
      'Администратор'
    const teacher = await this.prisma.teachers.upsert({
      where: { user_id: userId },
      update: {},
      create: { user_id: userId, full_name: fullName },
      select: { id: true },
    })
    return teacher.id
  }

  async findReviewTarget(homeworkId: number): Promise<TeacherReviewTarget | null> {
    const homework = await this.prisma.homeworks.findUnique({
      where: { id: homeworkId },
      select: {
        id: true,
        lesson_number: true,
        is_bonus: true,
        status: true,
        students: {
          select: {
            id: true,
            user_id: true,
            status: true,
            users: { select: { telegram_id: true } },
            student_teachers: { select: { teacher_id: true } },
          },
        },
      },
    })
    if (!homework) return null
    return {
      id: homework.id,
      studentId: homework.students.id,
      studentUserId: homework.students.user_id,
      studentTelegramId: Number(homework.students.users.telegram_id),
      studentStatus: homework.students.status,
      lessonNumber: homework.lesson_number,
      isBonus: Boolean(homework.is_bonus),
      status: homework.status,
      assignedTeacherIds: homework.students.student_teachers.map(
        ({ teacher_id }) => teacher_id,
      ),
    }
  }

  async saveReview(command: SaveTeacherReviewCommand): Promise<boolean> {
    return await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.homeworks.updateMany({
        where: { id: command.homeworkId, status: 'pending' },
        data: { status: command.homeworkStatus, updated_at: command.reviewedAt },
      })
      if (claimed.count === 0) return false

      await transaction.homework_reviews.create({
        data: {
          homework_id: command.homeworkId,
          teacher_id: command.teacherId,
          rating: command.rating,
          comment: command.comment,
          status: command.reviewStatus,
        },
      })

      if (command.feedbackMilestone != null && command.feedbackNotificationBody) {
        const existingInvite = await transaction.feedback_invites.findUnique({
          where: {
            student_id_milestone: {
              student_id: command.studentId,
              milestone: command.feedbackMilestone,
            },
          },
          select: { id: true },
        })
        if (!existingInvite) {
          await transaction.feedback_invites.create({
            data: {
              student_id: command.studentId,
              milestone: command.feedbackMilestone,
            },
          })
          await transaction.app_notifications.create({
            data: {
              user_id: command.studentUserId,
              kind: 'feedback_invite',
              body: command.feedbackNotificationBody,
              payload: JSON.stringify({ screen: 'feedback' }),
            },
          })
        }
      }

      await transaction.audit_log.create({
        data: {
          actor_user_id: command.actorUserId,
          action: 'teacher_review_homework',
          meta: JSON.stringify({
            homework_id: command.homeworkId,
            status: command.reviewStatus,
          }),
        },
      })
      await transaction.chat_messages.create({
        data: {
          student_id: command.studentId,
          sender_user_id: command.actorUserId,
          text_content: command.chatText,
          content_type: 'system',
        },
      })
      await transaction.app_notifications.create({
        data: {
          user_id: command.studentUserId,
          kind: 'homework_review',
          body: command.notificationBody,
          payload: command.notificationPayload,
        },
      })
      return true
    })
  }

  async listStudents(teacherId: number | null): Promise<TeacherStudentSummary[]> {
    const students = await this.prisma.students.findMany({
      where: {
        status: { in: ['studying', 'completed'] },
        ...(teacherId == null
          ? {}
          : { student_teachers: { some: { teacher_id: teacherId } } }),
      },
      orderBy: teacherId == null ? { full_name: 'asc' } : { id: 'asc' },
      select: summarySelect,
    })
    return students.map(mapSummary)
  }

  async findStudentHomeworks(
    studentId: number,
    teacherId: number | null,
    includeReviewed: boolean,
  ): Promise<TeacherStudentHomeworks | null> {
    const student = await this.prisma.students.findFirst({
      where: {
        id: studentId,
        status: { in: ['studying', 'completed'] },
        ...(teacherId == null
          ? {}
          : { student_teachers: { some: { teacher_id: teacherId } } }),
      },
      select: summarySelect,
    })
    if (!student) return null
    const homeworkRows = await this.prisma.homeworks.findMany({
      where: {
        student_id: studentId,
        ...(includeReviewed ? {} : { status: 'pending' }),
      },
      orderBy: { created_at: 'desc' },
      select: homeworkSelect,
    })
    const homeworks = homeworkRows.map(mapHomework)
    if (includeReviewed) {
      homeworks.sort((left, right) => {
        const priority = Number(right.status === 'pending') - Number(left.status === 'pending')
        return priority || right.createdAt.localeCompare(left.createdAt)
      })
    }
    return {
      student: mapSummary(student),
      homeworks,
    }
  }
}
