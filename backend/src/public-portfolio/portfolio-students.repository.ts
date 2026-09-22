export type PublicPortfolioStudent = {
  id: number
  fullName: string
  lessonsCount: number
  studentTrack: string
  metro: string | null
  averageRating: number | null
  approvedWorksCount: number
  hasAvatar: boolean
}

export abstract class PortfolioStudentsRepository {
  abstract listVisibleStudents(): Promise<PublicPortfolioStudent[]>
}
