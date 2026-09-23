import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import { ProfilesRepository } from './profiles.repository.js'

@Injectable()
export class PrismaProfilesRepository implements ProfilesRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async updateStudentAbout(
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

  async updateTeacherAbout(
    userId: number,
    aboutMe: string | null,
    updatedAt: string,
  ): Promise<boolean> {
    const result = await this.prisma.teachers.updateMany({
      where: { user_id: userId },
      data: { about_me: aboutMe, updated_at: updatedAt },
    })
    return result.count > 0
  }
}
