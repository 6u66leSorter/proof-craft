import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  StudentAvatarRepository,
  type PublicStudentAvatar,
} from './student-avatar.repository.js'

@Injectable()
export class PrismaStudentAvatarRepository implements StudentAvatarRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findVisibleStudentAvatar(studentId: number): Promise<PublicStudentAvatar | null> {
    const student = await this.prisma.students.findFirst({
      where: { id: studentId, status: 'studying' },
      select: { avatar_file_id: true },
    })
    return student ? { avatarFileId: student.avatar_file_id } : null
  }
}
