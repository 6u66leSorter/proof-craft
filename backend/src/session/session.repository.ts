export type SessionTeacher = {
  id: number
  fullName: string
}

export type SessionSnapshot = {
  roles: string[]
  vkAccountLinked: boolean
  student: null | {
    id: number
    fullName: string
    phone: string
    lessonsCount: number
    status: string
    studentTrack: string
    metro: string | null
    aboutMe: string
    hasAvatar: boolean
    averageRating: number | null
    ratingsCount: number
    teachers: SessionTeacher[]
  }
  teacher: null | {
    id: number
    fullName: string
    aboutMe: string
  }
  unreadNotificationsCount: number
}

export abstract class SessionRepository {
  abstract getByUserId(userId: number): Promise<SessionSnapshot | null>
}
