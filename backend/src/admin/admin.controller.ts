import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'
import {
  AdminAuditQueryGuard,
  AdminFeedbackQueryGuard,
  AdminHomeworksQueryGuard,
  AdminStudentParamsGuard,
  AdminStudentsQueryGuard,
} from './admin-read.guards.js'
import type { AdminReadRequest } from './admin-read.request.js'
import {
  GetAdminStudentUseCase,
  ListAdminAuditUseCase,
  ListAdminFeedbackUseCase,
  ListAdminHomeworksUseCase,
  ListAdminStudentsUseCase,
  ListAdminTeacherApplicationsUseCase,
  ListAdminTeachersUseCase,
} from './admin-read.use-cases.js'

@Controller(['api/admin', 'admin'])
export class AdminController {
  constructor(
    @Inject(ListAdminTeacherApplicationsUseCase)
    private readonly teacherApplications: ListAdminTeacherApplicationsUseCase,
    @Inject(ListAdminFeedbackUseCase)
    private readonly feedback: ListAdminFeedbackUseCase,
    @Inject(ListAdminTeachersUseCase)
    private readonly teachers: ListAdminTeachersUseCase,
    @Inject(ListAdminStudentsUseCase)
    private readonly students: ListAdminStudentsUseCase,
    @Inject(GetAdminStudentUseCase)
    private readonly student: GetAdminStudentUseCase,
    @Inject(ListAdminHomeworksUseCase)
    private readonly homeworks: ListAdminHomeworksUseCase,
    @Inject(ListAdminAuditUseCase)
    private readonly audit: ListAdminAuditUseCase,
  ) {}

  @Get('teacher-applications')
  @UseGuards(AuthenticationGuard)
  async listTeacherApplications(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<object> {
    return await this.teacherApplications.execute(principal)
  }

  @Get('feedback')
  @UseGuards(AdminFeedbackQueryGuard, AuthenticationGuard)
  async listFeedback(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminReadRequest,
  ): Promise<object> {
    return await this.feedback.execute(principal, request.adminFeedbackBefore)
  }

  @Get('teachers')
  @UseGuards(AuthenticationGuard)
  async listTeachers(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<object> {
    return await this.teachers.execute(principal)
  }

  @Get('students')
  @UseGuards(AdminStudentsQueryGuard, AuthenticationGuard)
  async listStudents(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminReadRequest,
  ): Promise<object> {
    return await this.students.execute(
      principal,
      request.adminStudentStatus ?? invalidParameters(),
    )
  }

  @Get('student/:student_id')
  @UseGuards(AdminStudentParamsGuard, AuthenticationGuard)
  async getStudent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminReadRequest,
  ): Promise<object> {
    return await this.student.execute(
      principal,
      request.adminStudentId ?? invalidParameters(),
    )
  }

  @Get('homeworks')
  @UseGuards(AdminHomeworksQueryGuard, AuthenticationGuard)
  async listHomeworks(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminReadRequest,
  ): Promise<object> {
    return await this.homeworks.execute(
      principal,
      request.adminHomeworkStudentId ?? null,
    )
  }

  @Get('audit')
  @UseGuards(AdminAuditQueryGuard, AuthenticationGuard)
  async listAudit(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminReadRequest,
  ): Promise<object> {
    return await this.audit.execute(
      principal,
      request.adminAuditLimit ?? invalidParameters(),
    )
  }
}
