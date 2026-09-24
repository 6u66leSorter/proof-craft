import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  ChatRepository,
  type ChatMessageRecord,
  type ChatStudent,
  type ChatStudentAccess,
  type ChatMessageTarget,
  type CreateChatMessageCommand,
} from './chat.repository.js'

type PrismaMessage = Awaited<ReturnType<PrismaChatRepository['loadMessage']>>

@Injectable()
export class PrismaChatRepository implements ChatRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findOwnStudent(userId: number): Promise<ChatStudent | null> {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      select: { id: true, full_name: true, status: true },
    })
    return student ? this.mapStudent(student) : null
  }

  async listActiveStudents(): Promise<ChatStudent[]> {
    const students = await this.prisma.students.findMany({
      where: { status: { in: ['studying', 'completed'] } },
      orderBy: { full_name: 'asc' },
      select: { id: true, full_name: true, status: true },
    })
    return students.map((student) => this.mapStudent(student))
  }

  async listAssignedActiveStudents(teacherUserId: number): Promise<ChatStudent[]> {
    const students = await this.prisma.students.findMany({
      where: {
        status: { in: ['studying', 'completed'] },
        student_teachers: { some: { teachers: { user_id: teacherUserId } } },
      },
      orderBy: { full_name: 'asc' },
      select: { id: true, full_name: true, status: true },
    })
    return students.map((student) => this.mapStudent(student))
  }

  async findStudentAccess(
    studentId: number,
    principalUserId: number,
  ): Promise<ChatStudentAccess | null> {
    const student = await this.prisma.students.findUnique({
      where: { id: studentId },
      select: {
        user_id: true,
        student_teachers: {
          where: { teachers: { user_id: principalUserId } },
          select: { student_id: true },
        },
      },
    })
    if (!student) return null
    return {
      ownerUserId: student.user_id,
      isAssignedTeacher: student.student_teachers.length > 0,
    }
  }

  async listMessages(studentId: number, limit: number): Promise<ChatMessageRecord[]> {
    const messages = await this.prisma.chat_messages.findMany({
      where: { student_id: studentId },
      orderBy: { id: 'desc' },
      take: limit,
      select: this.messageSelect(),
    })
    return messages.reverse().map((message) => this.mapMessage(message))
  }

  async findMessage(messageId: number): Promise<ChatMessageRecord | null> {
    const message = await this.loadMessage(messageId)
    return message ? this.mapMessage(message) : null
  }

  async findMessageTarget(
    studentId: number,
    senderUserId: number,
  ): Promise<ChatMessageTarget | null> {
    const [student, senderStudent] = await Promise.all([
      this.prisma.students.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          user_id: true,
          full_name: true,
          student_teachers: {
            select: { teachers: { select: { user_id: true } } },
          },
        },
      }),
      this.prisma.students.findUnique({
        where: { user_id: senderUserId },
        select: { id: true },
      }),
    ])
    if (!student) return null
    const assignedTeacherUserIds = student.student_teachers.map(
      ({ teachers }) => teachers.user_id,
    )
    return {
      studentId: student.id,
      studentUserId: student.user_id,
      studentFullName: student.full_name,
      senderStudentId: senderStudent?.id ?? null,
      ownerUserId: student.user_id,
      isAssignedTeacher: assignedTeacherUserIds.includes(senderUserId),
      assignedTeacherUserIds,
    }
  }

  async createMessage(command: CreateChatMessageCommand): Promise<ChatMessageRecord> {
    return await this.prisma.$transaction(async (transaction) => {
      const message = await transaction.chat_messages.create({
        data: {
          student_id: command.studentId,
          sender_user_id: command.senderUserId,
          text_content: command.textContent,
          content_type: command.contentType,
          file_id: command.fileId,
        },
        select: this.messageSelect(),
      })
      for (const notification of command.notifications) {
        await transaction.app_notifications.create({
          data: {
            user_id: notification.userId,
            kind: 'chat_message',
            body: notification.body,
            payload: JSON.stringify({
              student_id: command.studentId,
              message_id: message.id,
            }),
          },
        })
      }
      return this.mapMessage(message)
    })
  }

  private async loadMessage(messageId: number) {
    return await this.prisma.chat_messages.findUnique({
      where: { id: messageId },
      select: this.messageSelect(),
    })
  }

  private messageSelect() {
    return {
      id: true,
      student_id: true,
      sender_user_id: true,
      text_content: true,
      content_type: true,
      file_id: true,
      created_at: true,
      students: { select: { user_id: true } },
      users: {
        select: {
          telegram_id: true,
          first_name: true,
          last_name: true,
          username: true,
          user_roles: { select: { role: true } },
        },
      },
    } as const
  }

  private mapStudent(student: {
    id: number
    full_name: string
    status: string
  }): ChatStudent {
    return { id: student.id, fullName: student.full_name, status: student.status }
  }

  private mapMessage(message: NonNullable<PrismaMessage>): ChatMessageRecord {
    return {
      id: message.id,
      studentId: message.student_id,
      threadStudentUserId: message.students.user_id,
      senderUserId: message.sender_user_id,
      senderTelegramId: Number(message.users.telegram_id),
      senderFirstName: message.users.first_name,
      senderLastName: message.users.last_name,
      senderUsername: message.users.username,
      senderRoles: message.users.user_roles.map(({ role }) => role),
      textContent: message.text_content,
      contentType: message.content_type,
      fileId: message.file_id,
      createdAt: message.created_at,
    }
  }
}
