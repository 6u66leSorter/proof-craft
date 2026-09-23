import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { aboutCommandFrom, type AboutRequest } from './about.body.js'
import { AboutGuard } from './about.guard.js'
import { UpdateStudentAboutUseCase } from './update-student-about.use-case.js'

@Controller(['api/student', 'student'])
export class StudentProfileController {
  constructor(
    @Inject(UpdateStudentAboutUseCase)
    private readonly updateStudentAbout: UpdateStudentAboutUseCase,
  ) {}

  @Post('about')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AboutGuard, AuthenticationGuard)
  async updateAbout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AboutRequest,
  ): Promise<{ ok: true }> {
    return await this.updateStudentAbout.execute(principal, aboutCommandFrom(request))
  }
}
