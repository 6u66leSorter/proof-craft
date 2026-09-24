import { Controller, HttpCode, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { SubmitTeacherApplicationUseCase } from './submit-teacher-application.use-case.js'
import { RegisterStudentUseCase } from './register-student.use-case.js'
import { SubmitStudentFeedbackUseCase } from './submit-student-feedback.use-case.js'
import {
  studentFeedbackCommandFrom,
  type StudentFeedbackRequest,
} from './student-feedback.body.js'
import { StudentFeedbackGuard } from './student-feedback.guard.js'
import {
  studentRegistrationCommandFrom,
  type StudentRegistrationRequest,
} from './student-registration.body.js'
import { StudentRegistrationGuard } from './student-registration.guard.js'
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
    @Inject(RegisterStudentUseCase)
    private readonly registerStudent: RegisterStudentUseCase,
    @Inject(SubmitStudentFeedbackUseCase)
    private readonly submitStudentFeedback: SubmitStudentFeedbackUseCase,
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

  @Post(['api/students', 'students'])
  @UseGuards(StudentRegistrationGuard, AuthenticationGuard)
  async createStudent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: StudentRegistrationRequest,
  ) {
    return await this.registerStudent.execute(
      principal,
      studentRegistrationCommandFrom(request),
    )
  }

  @Post(['api/student/feedback', 'student/feedback'])
  @HttpCode(HttpStatus.OK)
  @UseGuards(StudentFeedbackGuard, AuthenticationGuard)
  async submitFeedback(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: StudentFeedbackRequest,
  ): Promise<{ ok: true }> {
    return await this.submitStudentFeedback.execute(
      principal,
      studentFeedbackCommandFrom(request),
    )
  }
}
