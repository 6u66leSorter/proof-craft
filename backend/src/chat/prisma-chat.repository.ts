import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  ChatRepository,
  type ChatMessageRecord,
  type ChatStudent,
  type ChatStudentAccess,
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
