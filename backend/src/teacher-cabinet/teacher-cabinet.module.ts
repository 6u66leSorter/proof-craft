import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { PrismaTeacherCabinetRepository } from './prisma-teacher-cabinet.repository.js'
import { TeacherCabinetController } from './teacher-cabinet.controller.js'
import { TeacherCabinetRepository } from './teacher-cabinet.repository.js'
import {
  GetTeacherDashboardUseCase,
  GetTeacherStudentHomeworksUseCase,
  ListTeacherStudentsUseCase,
} from './teacher-cabinet.use-cases.js'
import { TeacherStudentHomeworksGuard } from './teacher-student-homeworks.guard.js'
import { ReviewTeacherHomeworkUseCase } from './review-teacher-homework.use-case.js'
import { TeacherReviewGuard } from './teacher-review.guard.js'

@Module({
  imports: [AuthModule, NotificationsModule, PersistenceModule, StorageModule],
  controllers: [TeacherCabinetController],
  providers: [
    GetTeacherDashboardUseCase,
    GetTeacherStudentHomeworksUseCase,
    ListTeacherStudentsUseCase,
    ReviewTeacherHomeworkUseCase,
    TeacherStudentHomeworksGuard,
    TeacherReviewGuard,
    {
      provide: TeacherCabinetRepository,
      useClass: PrismaTeacherCabinetRepository,
    },
  ],
  exports: [GetTeacherDashboardUseCase, GetTeacherStudentHomeworksUseCase, ReviewTeacherHomeworkUseCase],
})
export class TeacherCabinetModule {}
