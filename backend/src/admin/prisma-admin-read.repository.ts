import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  AdminReadRepository,
  type AdminHomework,
  type AdminStudent,
  type AdminStudentDetail,
  type AdminStudentTeacher,
} from './admin-read.repository.js'
import type { AdminStudentStatus } from './admin-read.request.js'

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
  students: { select: { full_name: true } },
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

const studentSelect = {
  id: true,
  user_id: true,
  full_name: true,
  phone: true,
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
      status: true,
      homework_reviews: {
        where: { status: 'approved', rating: { not: null } },
        select: { rating: true },
      },
    },
  },
} satisfies Prisma.studentsSelect

type StudentRow = Prisma.studentsGetPayload<{ select: typeof studentSelect }>

const normalizedTeacherName = (
  teacher: StudentRow['student_teachers'][number]['teachers'],
): string =>
  teacher.full_name.trim().replace(/\s+/g, ' ') ||
  [teacher.users.first_name, teacher.users.last_name].filter(Boolean).join(' ').trim()

const mapStudent = (student: StudentRow): AdminStudent => {
  const ratings = student.homeworks.flatMap((homework) =>
    homework.homework_reviews.flatMap((review) =>
      review.rating == null ? [] : [Number(review.rating)],
    ),
  )
  const teachers: AdminStudentTeacher[] = student.student_teachers.map(({ teachers }) => ({
    id: teachers.id,
    fullName: normalizedTeacherName(teachers),
  }))
  return {
    id: student.id,
    userId: student.user_id,
    fullName: student.full_name,
    phone: student.phone,
    telegramId: Number(student.users.telegram_id),
    username: student.users.username,
    firstName: student.users.first_name,
    lastName: student.users.last_name,
    lessonsCount: student.lessons_count,
    status: student.status,
    studentTrack: student.student_track || 'student',
    metro: student.metro,
    aboutMe: student.about_me,
    avatarFileId: student.avatar_file_id,
    teachers,
    averageRating:
      ratings.length > 0
        ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
        : null,
    ratingsCount: ratings.length,
    pendingHomeworksCount: student.homeworks.filter(({ status }) => status === 'pending').length,
  }
}

const mapHomework = (homework: HomeworkRow): AdminHomework => ({
  id: homework.id,
  studentId: homework.student_id,
  studentName: homework.students.full_name,
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

const sortStudentHomeworks = (homeworks: AdminHomework[]): AdminHomework[] =>
  homeworks.sort((left, right) => {
    const statusOrder = Number(right.status === 'pending') - Number(left.status === 'pending')
    return statusOrder || right.createdAt.localeCompare(left.createdAt)
  })

@Injectable()
export class PrismaAdminReadRepository implements AdminReadRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPendingTeacherApplications() {
    const rows = await this.prisma.teacher_applications.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        full_name: true,
        phone: true,
        created_at: true,
        users: { select: { telegram_id: true } },
      },
    })
    return rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      telegramId: Number(row.users.telegram_id),
      createdAt: row.created_at,
    }))
  }

  async listFeedback(before?: number) {
    const rows = await this.prisma.private_feedback.findMany({
      ...(before ? { where: { id: { lt: before } } } : {}),
      orderBy: { id: 'desc' },
      take: 51,
      select: {
        id: true,
        subject: true,
        message: true,
        created_at: true,
        students: { select: { full_name: true } },
      },
    })
    return rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      message: row.message,
      createdAt: row.created_at,
      fullName: row.students.full_name,
    }))
  }

  async listTeachers() {
    const rows = await this.prisma.teachers.findMany({
      orderBy: { full_name: 'asc' },
      select: {
        id: true,
        user_id: true,
        full_name: true,
        users: {
          select: {
            telegram_id: true,
            username: true,
            teacher_applications: {
              where: { status: 'approved' },
              orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { phone: true },
            },
          },
        },
        student_teachers: {
          where: { students: { status: { in: ['studying', 'completed'] } } },
          select: {
            students: {
              select: {
                id: true,
                full_name: true,
                users: { select: { telegram_id: true, username: true } },
              },
            },
          },
        },
      },
    })
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      fullName: row.full_name,
      phone: row.users.teacher_applications[0]?.phone ?? null,
      telegramId: Number(row.users.telegram_id),
      username: row.users.username,
      students: row.student_teachers.map(({ students }) => ({
        id: students.id,
        fullName: students.full_name,
        telegramId: Number(students.users.telegram_id),
        username: students.users.username,
      })),
    }))
  }

  async listStudents(status: AdminStudentStatus): Promise<AdminStudent[]> {
    const rows = await this.prisma.students.findMany({
      where: { status },
      orderBy: ['moderation', 'rejected'].includes(status)
        ? { created_at: 'desc' }
        : { full_name: 'asc' },
      select: studentSelect,
    })
    return rows.map(mapStudent)
  }

  async findStudent(studentId: number): Promise<AdminStudentDetail | null> {
    const student = await this.prisma.students.findUnique({
      where: { id: studentId },
      select: {
        ...studentSelect,
        homeworks: { orderBy: { created_at: 'desc' }, select: homeworkSelect },
      },
    })
    if (!student) return null
    return {
      student: mapStudent({
        ...student,
        homeworks: student.homeworks.map((homework) => ({
          status: homework.status,
          homework_reviews: homework.homework_reviews
            .filter((review) => review.status === 'approved' && review.rating != null)
            .map(({ rating }) => ({ rating })),
        })),
      }),
      homeworks: sortStudentHomeworks(student.homeworks.map(mapHomework)),
    }
  }

  async listHomeworks(studentId: number | null): Promise<AdminHomework[]> {
    const rows = await this.prisma.homeworks.findMany({
      ...(studentId ? { where: { student_id: studentId } } : {}),
      orderBy: { created_at: 'desc' },
      select: homeworkSelect,
    })
    const homeworks = rows.map(mapHomework)
    return studentId ? sortStudentHomeworks(homeworks) : homeworks
  }

  async listAudit(limit: number) {
    const rows = await this.prisma.audit_log.findMany({
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        meta: true,
        created_at: true,
        actor_user_id: true,
        users: { select: { telegram_id: true } },
      },
    })
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      meta: row.meta,
      createdAt: row.created_at,
      actorUserId: row.actor_user_id,
      actorTelegramId: Number(row.users.telegram_id),
    }))
  }
}
