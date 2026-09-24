export type SaveTeacherApplication = {
  existingUserId: number | null
  claimedTelegramId: number
  vkUserId: number | null
  firstName: string
  lastName: string | null
  fullName: string
  phone: string
  adminMessage: string
  createdAt: string
}

export type SavedTeacherApplication = {
  adminTelegramIds: number[]
}

export abstract class RegistrationRepository {
  abstract saveTeacherApplication(
    command: SaveTeacherApplication,
  ): Promise<SavedTeacherApplication>
}
