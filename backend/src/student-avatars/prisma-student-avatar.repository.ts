import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  StudentAvatarRepository,
  type StudentAvatar,
  type StudentAvatarAccess,
} from './student-avatar.repository.js'

@Injectable()
export class PrismaStudentAvatarRepository implements StudentAvatarRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: number): Promise<StudentAvatar | null> {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      select: { id: true, avatar_file_id: true },
    })
    return student
      ? { studentId: student.id, avatarFileId: student.avatar_file_id }
      : null
  }

  async findAccess(
    studentId: number,
    userId: number | null,
  ): Promise<StudentAvatarAccess | null> {
    const student = await this.prisma.students.findUnique({
      where: { id: studentId },
      select: {
        avatar_file_id: true,
        user_id: true,
        student_teachers: {
          select: { teachers: { select: { user_id: true } } },
        },
      },
    })
    if (!student) return null
    return {
      avatarFileId: student.avatar_file_id,
      studentId: studentId,
      isOwner: userId != null && student.user_id === userId,
      isAssignedTeacher:
        userId != null &&
        student.student_teachers.some(({ teachers }) => teachers.user_id === userId),
    }
  }

  async updateAvatar(studentId: number, avatarFileId: string): Promise<void> {
    const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
    await this.prisma.students.update({
      where: { id: studentId },
      data: { avatar_file_id: avatarFileId, updated_at: updatedAt },
    })
  }
}
