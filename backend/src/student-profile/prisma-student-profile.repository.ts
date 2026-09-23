import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import { StudentProfileRepository } from './student-profile.repository.js'

@Injectable()
export class PrismaStudentProfileRepository implements StudentProfileRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async updateAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.prisma.students.updateMany({
      where: { user_id: userId },
      data: { about_me: aboutMe, updated_at: updatedAt },
    })
    return result.count > 0
  }
}
