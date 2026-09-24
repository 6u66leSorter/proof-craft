import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { FileReferenceService } from '../storage/file-reference.service.js'
import { studentHomeworkResponse } from './student-homework.response.js'
import { StudentHomeworksRepository } from './student-homeworks.repository.js'

@Injectable()
export class ListStudentHomeworksUseCase {
  constructor(
    @Inject(StudentHomeworksRepository)
    private readonly studentHomeworks: StudentHomeworksRepository,
    @Inject(FileReferenceService)
    private readonly files: FileReferenceService,
  ) {}

  async execute(principal: AuthenticatedPrincipal): Promise<object> {
    const snapshot = principal.user
      ? await this.studentHomeworks.findByUserId(principal.user.id)
      : null
    if (!snapshot) {
      throw new HttpException(
        { ok: false, error: 'Ученик не найден.' },
        HttpStatus.NOT_FOUND,
      )
    }

    return {
      ok: true,
      data: {
        homeworks: snapshot.homeworks.map((homework) => studentHomeworkResponse(homework, this.files)),
        average_rating: snapshot.averageRating,
        ratings_count: snapshot.ratingsCount,
      },
    }
  }
}
