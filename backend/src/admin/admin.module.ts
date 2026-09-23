import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
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

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [AdminController],
  providers: [
    AdminAuditQueryGuard,
    AdminFeedbackQueryGuard,
    AdminHomeworksQueryGuard,
    AdminStudentParamsGuard,
    AdminStudentsQueryGuard,
    GetAdminStudentUseCase,
    ListAdminAuditUseCase,
    ListAdminFeedbackUseCase,
    ListAdminHomeworksUseCase,
    ListAdminStudentsUseCase,
    ListAdminTeacherApplicationsUseCase,
    ListAdminTeachersUseCase,
    {
      provide: AdminReadRepository,
      useClass: PrismaAdminReadRepository,
    },
  ],
})
export class AdminModule {}
