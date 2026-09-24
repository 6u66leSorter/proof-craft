import { Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { ChatAccessPolicy } from './chat-access.policy.js'
import { mapChatMessage } from './chat-message.mapper.js'
import { ChatRepository } from './chat.repository.js'
import type { ChatMessagesQuery } from './chat.request.js'

@Injectable()
export class ListChatStudentsUseCase {
  constructor(
    @Inject(ChatRepository) private readonly chats: ChatRepository,
    @Inject(ChatAccessPolicy) private readonly access: ChatAccessPolicy,
  ) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    const user = this.access.requireUser(principal)
    const ownStudent = await this.chats.findOwnStudent(user.id)
    const students = ownStudent
      ? [ownStudent]
      : user.roles.includes('admin')
        ? await this.chats.listActiveStudents()
        : user.roles.includes('teacher')
          ? await this.chats.listAssignedActiveStudents(user.id)
          : []
    return {
      ok: true,
      data: {
        students: students.map((student) => ({
          id: student.id,
          full_name: student.fullName,
          status: student.status,
        })),
      },
    }
  }
}

@Injectable()
export class ListChatMessagesUseCase {
  constructor(
    @Inject(ChatRepository) private readonly chats: ChatRepository,
    @Inject(ChatAccessPolicy) private readonly access: ChatAccessPolicy,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    query: ChatMessagesQuery,
  ): Promise<object> {
    const user = this.access.requireUser(principal)
    const studentAccess = await this.chats.findStudentAccess(query.studentId, user.id)
    this.access.assertStudentAccess(
      user,
      studentAccess,
      'Нет доступа к чату этого ученика.',
    )
    const messages = await this.chats.listMessages(query.studentId, query.limit)
    return { ok: true, data: { messages: messages.map(mapChatMessage) } }
  }
}
