import { Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common'
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
import {
  adminStudentModerationCommandFrom,
  type AdminStudentModerationRequest,
} from './admin-student-moderation.body.js'
import { AdminStudentModerationGuard } from './admin-student-moderation.guard.js'
import { ModerateAdminStudentUseCase } from './moderate-admin-student.use-case.js'
import {
  adminTeacherRoleCommandFrom,
  type AdminTeacherRoleRequest,
} from './admin-teacher-role.body.js'
import { AdminTeacherRoleGuard } from './admin-teacher-role.guard.js'
import { ChangeAdminTeacherRoleUseCase } from './change-admin-teacher-role.use-case.js'
import {
  adminStudentAssignmentCommandFrom,
  type AdminStudentAssignmentRequest,
} from './admin-student-assignment.body.js'
import { AdminStudentAssignmentGuard } from './admin-student-assignment.guard.js'
import { ChangeAdminStudentAssignmentUseCase } from './change-admin-student-assignment.use-case.js'
import {
  adminStudentUpdateCommandFrom,
  type AdminStudentUpdateRequest,
} from './admin-student-update.body.js'
import { AdminStudentUpdateGuard } from './admin-student-update.guard.js'
import { UpdateAdminStudentUseCase } from './update-admin-student.use-case.js'
import {
  adminTeacherApplicationCommandFrom,
  type AdminTeacherApplicationRequest,
} from './admin-teacher-application.body.js'
import { AdminTeacherApplicationGuard } from './admin-teacher-application.guard.js'
import { DecideAdminTeacherApplicationUseCase } from './decide-admin-teacher-application.use-case.js'

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
    @Inject(ModerateAdminStudentUseCase)
    private readonly moderateStudent: ModerateAdminStudentUseCase,
    @Inject(ChangeAdminTeacherRoleUseCase)
    private readonly changeTeacherRole: ChangeAdminTeacherRoleUseCase,
    @Inject(ChangeAdminStudentAssignmentUseCase)
    private readonly changeStudentAssignment: ChangeAdminStudentAssignmentUseCase,
    @Inject(UpdateAdminStudentUseCase)
    private readonly updateStudent: UpdateAdminStudentUseCase,
    @Inject(DecideAdminTeacherApplicationUseCase)
    private readonly decideTeacherApplication: DecideAdminTeacherApplicationUseCase,
  ) {}

  @Get('teacher-applications')
  @UseGuards(AuthenticationGuard)
  async listTeacherApplications(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<object> {
    return await this.teacherApplications.execute(principal)
  }

  @Post('teacher-applications')
  @HttpCode(200)
  @UseGuards(AdminTeacherApplicationGuard, AuthenticationGuard)
  async decideOnTeacherApplication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminTeacherApplicationRequest,
  ): Promise<object> {
    return await this.decideTeacherApplication.execute(
      principal,
      adminTeacherApplicationCommandFrom(request),
    )
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

  @Post('teachers')
  @HttpCode(200)
  @UseGuards(AdminTeacherRoleGuard, AuthenticationGuard)
  async changeTeacher(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminTeacherRoleRequest,
  ): Promise<{ ok: true }> {
    return await this.changeTeacherRole.execute(
      principal,
      adminTeacherRoleCommandFrom(request),
    )
  }

  @Post('assign-student')
  @HttpCode(200)
  @UseGuards(AdminStudentAssignmentGuard, AuthenticationGuard)
  async assignStudent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminStudentAssignmentRequest,
  ): Promise<{ ok: true }> {
    return await this.changeStudentAssignment.assign(
      principal,
      adminStudentAssignmentCommandFrom(request),
    )
  }

  @Post('unassign-student')
  @HttpCode(200)
  @UseGuards(AdminStudentAssignmentGuard, AuthenticationGuard)
  async unassignStudent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminStudentAssignmentRequest,
  ): Promise<{ ok: true }> {
    return await this.changeStudentAssignment.unassign(
      principal,
      adminStudentAssignmentCommandFrom(request),
    )
  }

  @Post('update-student')
  @HttpCode(200)
  @UseGuards(AdminStudentUpdateGuard, AuthenticationGuard)
  async updateStudentProfile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminStudentUpdateRequest,
  ): Promise<{ ok: true }> {
    return await this.updateStudent.execute(
      principal,
      adminStudentUpdateCommandFrom(request),
    )
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

  @Post('students')
  @HttpCode(200)
  @UseGuards(AdminStudentModerationGuard, AuthenticationGuard)
  async moderate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: AdminStudentModerationRequest,
  ): Promise<{ ok: true }> {
    return await this.moderateStudent.execute(
      principal,
      adminStudentModerationCommandFrom(request),
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
