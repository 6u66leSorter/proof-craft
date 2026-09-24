import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { AdminController } from './admin.controller.js'
import {
  AdminAuditQueryGuard,
  AdminFeedbackQueryGuard,
  AdminHomeworksQueryGuard,
  AdminStudentParamsGuard,
  AdminStudentsQueryGuard,
} from './admin-read.guards.js'
import { AdminReadRepository } from './admin-read.repository.js'
import {
  GetAdminStudentUseCase,
  ListAdminAuditUseCase,
  ListAdminFeedbackUseCase,
  ListAdminHomeworksUseCase,
  ListAdminStudentsUseCase,
  ListAdminTeacherApplicationsUseCase,
  ListAdminTeachersUseCase,
} from './admin-read.use-cases.js'
import { PrismaAdminReadRepository } from './prisma-admin-read.repository.js'
import { AdminStudentModerationGuard } from './admin-student-moderation.guard.js'
import { AdminStudentModerationRepository } from './admin-student-moderation.repository.js'
import { ModerateAdminStudentUseCase } from './moderate-admin-student.use-case.js'
import { PrismaAdminStudentModerationRepository } from './prisma-admin-student-moderation.repository.js'
import { AdminTeacherRoleGuard } from './admin-teacher-role.guard.js'
import { AdminTeacherRoleRepository } from './admin-teacher-role.repository.js'
import { ChangeAdminTeacherRoleUseCase } from './change-admin-teacher-role.use-case.js'
import { PrismaAdminTeacherRoleRepository } from './prisma-admin-teacher-role.repository.js'
import { AdminStudentAssignmentGuard } from './admin-student-assignment.guard.js'
import { AdminStudentAssignmentRepository } from './admin-student-assignment.repository.js'
import { ChangeAdminStudentAssignmentUseCase } from './change-admin-student-assignment.use-case.js'
import { PrismaAdminStudentAssignmentRepository } from './prisma-admin-student-assignment.repository.js'
import { AdminStudentUpdateGuard } from './admin-student-update.guard.js'
import { AdminStudentUpdateRepository } from './admin-student-update.repository.js'
import { PrismaAdminStudentUpdateRepository } from './prisma-admin-student-update.repository.js'
import { UpdateAdminStudentUseCase } from './update-admin-student.use-case.js'
import { AdminTeacherApplicationGuard } from './admin-teacher-application.guard.js'
import { AdminTeacherApplicationRepository } from './admin-teacher-application.repository.js'
import { DecideAdminTeacherApplicationUseCase } from './decide-admin-teacher-application.use-case.js'
import { PrismaAdminTeacherApplicationRepository } from './prisma-admin-teacher-application.repository.js'

@Module({
  imports: [AuthModule, NotificationsModule, PersistenceModule, StorageModule],
  controllers: [AdminController],
  providers: [
    AdminAuditQueryGuard,
    AdminFeedbackQueryGuard,
    AdminHomeworksQueryGuard,
    AdminStudentParamsGuard,
    AdminStudentsQueryGuard,
    AdminStudentModerationGuard,
    AdminTeacherRoleGuard,
    AdminStudentAssignmentGuard,
    AdminStudentUpdateGuard,
    AdminTeacherApplicationGuard,
    GetAdminStudentUseCase,
    ListAdminAuditUseCase,
    ListAdminFeedbackUseCase,
    ListAdminHomeworksUseCase,
    ListAdminStudentsUseCase,
    ListAdminTeacherApplicationsUseCase,
    ListAdminTeachersUseCase,
    ModerateAdminStudentUseCase,
    ChangeAdminTeacherRoleUseCase,
    ChangeAdminStudentAssignmentUseCase,
    UpdateAdminStudentUseCase,
    DecideAdminTeacherApplicationUseCase,
    {
      provide: AdminReadRepository,
      useClass: PrismaAdminReadRepository,
    },
    {
      provide: AdminStudentModerationRepository,
      useClass: PrismaAdminStudentModerationRepository,
    },
    {
      provide: AdminTeacherRoleRepository,
      useClass: PrismaAdminTeacherRoleRepository,
    },
    {
      provide: AdminStudentAssignmentRepository,
      useClass: PrismaAdminStudentAssignmentRepository,
    },
    {
      provide: AdminStudentUpdateRepository,
      useClass: PrismaAdminStudentUpdateRepository,
    },
    {
      provide: AdminTeacherApplicationRepository,
      useClass: PrismaAdminTeacherApplicationRepository,
    },
  ],
})
export class AdminModule {}
