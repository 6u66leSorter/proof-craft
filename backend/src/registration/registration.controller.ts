import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { SubmitTeacherApplicationUseCase } from './submit-teacher-application.use-case.js'
import {
  teacherApplicationCommandFrom,
  type TeacherApplicationRequest,
} from './teacher-application.body.js'
import { TeacherApplicationGuard } from './teacher-application.guard.js'

@Controller()
export class RegistrationController {
  constructor(
    @Inject(SubmitTeacherApplicationUseCase)
    private readonly submitTeacherApplication: SubmitTeacherApplicationUseCase,
  ) {}

  @Post(['api/teacher-application', 'teacher-application'])
  @HttpCode(HttpStatus.OK)
  @UseGuards(TeacherApplicationGuard, AuthenticationGuard)
  async submitApplication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: TeacherApplicationRequest,
  ): Promise<{ ok: true }> {
    return await this.submitTeacherApplication.execute(
      principal,
      teacherApplicationCommandFrom(request),
    )
  }
}
