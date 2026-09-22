import { Inject, Injectable } from '@nestjs/common'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { ShowcaseRepository, type ShowcaseCandidate } from './showcase.repository.js'

export type ShowcaseHomeworkResponse = {
  id: number
  student_name: string
  haircut_name: string | null
  content_type: string
  created_at: string
}

export type ShowcaseResponse = {
  ok: true
  data: {
    cycled: boolean
    homeworks: ShowcaseHomeworkResponse[]
  }
}

const pickRandom = (items: ShowcaseCandidate[], count: number): ShowcaseCandidate[] => {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1))
    const current = shuffled[index]
    const other = shuffled[otherIndex]
    if (!current || !other) continue
    shuffled[index] = other
    shuffled[otherIndex] = current
  }
  return shuffled.slice(0, count)
}

@Injectable()
export class ListShowcaseHomeworksUseCase {
  constructor(
    @Inject(ShowcaseRepository)
    private readonly showcase: ShowcaseRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(limit: number, excludedIds: ReadonlySet<number>): Promise<ShowcaseResponse> {
    const rows = await this.showcase.listApprovedMedia()
    const unique = new Map<string, ShowcaseCandidate>()
    for (const row of rows) {
      const availability = this.files.getAvailability(row.fileId)
      if (!availability.hasLocalFile && !availability.hasTelegramFile) continue
      const key = `${row.studentId}:${row.fileId || ''}`
      if (!unique.has(key)) unique.set(key, row)
    }

    const pool = [...unique.values()]
    const unseenPool = pool.filter((homework) => !excludedIds.has(homework.id))
    const selected = pickRandom(unseenPool, limit)
    const cycled = selected.length < limit
    if (cycled) {
      const selectedIds = new Set(selected.map(({ id }) => id))
      const fallbackPool = pool.filter(({ id }) => !selectedIds.has(id))
      selected.push(...pickRandom(fallbackPool, limit - selected.length))
    }

    return {
      ok: true,
      data: {
        cycled,
        homeworks: selected.map((homework) => ({
          id: homework.id,
          student_name: homework.studentName,
          haircut_name: homework.haircutName,
          content_type: homework.contentType,
          created_at: homework.createdAt,
        })),
      },
    }
  }
}
