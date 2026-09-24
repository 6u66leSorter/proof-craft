export type ChatStudent = {
  id: number
  fullName: string
  status: string
}

export type ChatStudentAccess = {
  ownerUserId: number
  isAssignedTeacher: boolean
}

export type ChatMessageRecord = {
  id: number
  studentId: number
  threadStudentUserId: number
  senderUserId: number
  senderTelegramId: number
  senderFirstName: string | null
  senderLastName: string | null
  senderUsername: string | null
  senderRoles: string[]
  textContent: string | null
  contentType: string
  fileId: string | null
  createdAt: string
}

export abstract class ChatRepository {
  abstract findOwnStudent(userId: number): Promise<ChatStudent | null>
  abstract listActiveStudents(): Promise<ChatStudent[]>
  abstract listAssignedActiveStudents(teacherUserId: number): Promise<ChatStudent[]>
  abstract findStudentAccess(
    studentId: number,
    principalUserId: number,
  ): Promise<ChatStudentAccess | null>
  abstract listMessages(studentId: number, limit: number): Promise<ChatMessageRecord[]>
  abstract findMessage(messageId: number): Promise<ChatMessageRecord | null>
}
