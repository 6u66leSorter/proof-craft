import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  teacherStudentHomeworksQueryFrom,
  type TeacherCabinetRequest,
} from './teacher-cabinet.request.js'
import { TeacherStudentHomeworksGuard } from './teacher-student-homeworks.guard.js'
import {
  GetTeacherDashboardUseCase,
  GetTeacherStudentHomeworksUseCase,
  ListTeacherStudentsUseCase,
} from './teacher-cabinet.use-cases.js'

@Controller(['api/teacher', 'teacher'])
export class TeacherCabinetController {
  constructor(
    @Inject(GetTeacherDashboardUseCase)
    private readonly dashboard: GetTeacherDashboardUseCase,
    @Inject(GetTeacherStudentHomeworksUseCase)
    private readonly studentHomeworks: GetTeacherStudentHomeworksUseCase,
    @Inject(ListTeacherStudentsUseCase)
    private readonly students: ListTeacherStudentsUseCase,
  ) {}

  @Get('dashboard')
  @UseGuards(AuthenticationGuard)
  async getDashboard(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<object> {
    return await this.dashboard.execute(principal)
  }

  @Get('student-homeworks')
  @UseGuards(TeacherStudentHomeworksGuard, AuthenticationGuard)
  async getStudentHomeworks(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: TeacherCabinetRequest,
  ): Promise<object> {
    return await this.studentHomeworks.execute(
      principal,
      teacherStudentHomeworksQueryFrom(request),
    )
  }

  @Get('students')
  @UseGuards(AuthenticationGuard)
  async listStudents(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<object> {
    return await this.students.execute(principal)
  }
}
