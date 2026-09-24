import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { requireAdminPrincipal } from '../auth/require-admin-principal.js'
import { sqliteTimestamp } from '../common/sqlite-timestamp.js'
import type { UpdateAdminStudentCommand } from './admin-student-update.body.js'
import { AdminStudentUpdateRepository } from './admin-student-update.repository.js'

@Injectable()
export class UpdateAdminStudentUseCase {
  constructor(
    @Inject(AdminStudentUpdateRepository)
    private readonly students: AdminStudentUpdateRepository,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    command: UpdateAdminStudentCommand,
  ): Promise<{ ok: true }> {
    const admin = requireAdminPrincipal(principal)
    const student = await this.students.findStudent(command.studentId)
    if (!student) {
      throw new HttpException(
        { ok: false, error: 'Ученик не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    await this.students.applyProfilePatch({
      studentId: student.id,
      ...(command.lessonsCount === undefined
        ? {}
        : { lessonsCount: command.lessonsCount }),
      ...(command.studentTrack === undefined
        ? {}
        : { studentTrack: command.studentTrack }),
      updatedAt: sqliteTimestamp(),
    })

    if (command.teacherIds !== undefined) {
      if (!['studying', 'completed'].includes(student.status)) {
        throw new HttpException(
          {
            ok: false,
            error:
              'Назначать преподавателей можно только при статусе «обучается» или «завершил».',
          },
          HttpStatus.BAD_REQUEST,
        )
      }
      const missingTeacherId = await this.students.findFirstMissingTeacherId(
        command.teacherIds,
      )
      if (missingTeacherId != null) {
        throw new HttpException(
          {
            ok: false,
            error: `Преподаватель с id ${missingTeacherId} не найден.`,
          },
          HttpStatus.BAD_REQUEST,
        )
      }
      const effectiveTrack = command.studentTrack ?? student.track
      await this.students.replaceTeachers(
        student.id,
        command.teacherIds,
        effectiveTrack !== 'barber',
      )
    }

    await this.students.appendAudit({
      actorUserId: admin.id,
      ...command,
    })
    return { ok: true }
  }
}
