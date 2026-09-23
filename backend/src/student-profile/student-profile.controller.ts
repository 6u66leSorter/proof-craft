import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  studentAboutCommandFrom,
  type StudentAboutRequest,
} from './student-about.body.js'
import { StudentAboutGuard } from './student-about.guard.js'
import { UpdateStudentAboutUseCase } from './update-student-about.use-case.js'

@Controller(['api/student', 'student'])
export class StudentProfileController {
  constructor(
    @Inject(UpdateStudentAboutUseCase)
    private readonly updateStudentAbout: UpdateStudentAboutUseCase,
  ) {}

  @Post('about')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StudentAboutGuard, AuthenticationGuard)
  async updateAbout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: StudentAboutRequest,
  ): Promise<{ ok: true }> {
    return await this.updateStudentAbout.execute(
      principal,
      studentAboutCommandFrom(request),
    )
  }
}
