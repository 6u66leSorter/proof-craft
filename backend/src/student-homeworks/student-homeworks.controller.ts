import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { ListStudentHomeworksUseCase } from './list-student-homeworks.use-case.js'

@Controller(['api/student/homeworks', 'student/homeworks'])
@UseGuards(AuthenticationGuard)
export class StudentHomeworksController {
  constructor(
    @Inject(ListStudentHomeworksUseCase)
    private readonly listStudentHomeworks: ListStudentHomeworksUseCase,
  ) {}

  @Get()
  async list(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<object> {
    return await this.listStudentHomeworks.execute(principal)
  }
}
