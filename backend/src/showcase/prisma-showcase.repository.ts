import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../persistence/prisma/prisma.service.js'
import {
  ShowcaseRepository,
  type ShowcaseCandidate,
  type ShowcaseHomeworkFileRecord,
} from './showcase.repository.js'

const APPROVED_STATUS = 'approved'
const SHOWCASE_CONTENT_TYPES = ['photo', 'video']

@Injectable()
export class PrismaShowcaseRepository implements ShowcaseRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listApprovedMedia(): Promise<ShowcaseCandidate[]> {
    const rows = await this.prisma.homeworks.findMany({
      where: {
        status: APPROVED_STATUS,
        content_type: { in: SHOWCASE_CONTENT_TYPES },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        student_id: true,
        haircut_name: true,
        content_type: true,
        file_id: true,
        created_at: true,
        students: { select: { full_name: true } },
      },
    })

    return rows.map((row) => ({
      id: row.id,
      studentId: row.student_id,
      studentName: row.students.full_name,
      haircutName: row.haircut_name || null,
      contentType: row.content_type,
      fileId: row.file_id,
      createdAt: row.created_at,
    }))
  }

  async findHomeworkFile(homeworkId: number): Promise<ShowcaseHomeworkFileRecord | null> {
    const homework = await this.prisma.homeworks.findUnique({
      where: { id: homeworkId },
      select: { status: true, content_type: true, file_id: true },
    })
    return homework
      ? {
          status: homework.status,
          contentType: homework.content_type,
          fileId: homework.file_id,
        }
      : null
  }
}
