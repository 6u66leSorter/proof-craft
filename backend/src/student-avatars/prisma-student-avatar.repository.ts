import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  StudentAvatarRepository,
  type StudentAvatar,
} from './student-avatar.repository.js'

@Injectable()
export class PrismaStudentAvatarRepository implements StudentAvatarRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByUserId(userId: number): Promise<StudentAvatar | null> {
    const student = await this.prisma.students.findUnique({
      where: { user_id: userId },
      select: { avatar_file_id: true },
    })
    return student ? { avatarFileId: student.avatar_file_id } : null
  }
}
