export type ShowcaseCandidate = {
  id: number
  studentId: number
  studentName: string
  haircutName: string | null
  contentType: string
  fileId: string | null
  createdAt: string
}

export type ShowcaseHomeworkFileRecord = {
  status: string
  contentType: string
  fileId: string | null
}

export abstract class ShowcaseRepository {
  abstract listApprovedMedia(): Promise<ShowcaseCandidate[]>
  abstract findHomeworkFile(homeworkId: number): Promise<ShowcaseHomeworkFileRecord | null>
}
