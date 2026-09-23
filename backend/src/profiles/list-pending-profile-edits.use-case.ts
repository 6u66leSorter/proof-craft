import { Inject, Injectable } from '@nestjs/common'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { ProfilesRepository } from './profiles.repository.js'

@Injectable()
export class ListPendingProfileEditsUseCase {
  constructor(
    @Inject(ProfilesRepository)
    private readonly profiles: ProfilesRepository,
  ) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    requireAdminPrincipal(principal)
    const edits = await this.profiles.listPendingProfileEdits()
    return {
      ok: true,
      data: {
        edits: edits.map((edit) => ({
          id: edit.id,
          student_id: edit.studentId,
          new_full_name: edit.newFullName,
          new_phone: edit.newPhone,
          new_metro: edit.newMetro,
          created_at: edit.createdAt,
          current_full_name: edit.currentFullName,
          current_phone: edit.currentPhone,
          current_metro: edit.currentMetro,
          telegram_id: edit.telegramId,
        })),
      },
    }
  }
}
