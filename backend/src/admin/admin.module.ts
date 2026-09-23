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
    GetAdminStudentUseCase,
    ListAdminAuditUseCase,
    ListAdminFeedbackUseCase,
    ListAdminHomeworksUseCase,
    ListAdminStudentsUseCase,
    ListAdminTeacherApplicationsUseCase,
    ListAdminTeachersUseCase,
    ModerateAdminStudentUseCase,
    {
      provide: AdminReadRepository,
      useClass: PrismaAdminReadRepository,
    },
    {
      provide: AdminStudentModerationRepository,
      useClass: PrismaAdminStudentModerationRepository,
    },
  ],
})
export class AdminModule {}
