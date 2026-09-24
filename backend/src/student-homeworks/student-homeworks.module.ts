import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { ListStudentHomeworksUseCase } from './list-student-homeworks.use-case.js'
import { PrismaStudentHomeworksRepository } from './prisma-student-homeworks.repository.js'
import { StudentHomeworksController } from './student-homeworks.controller.js'
import { StudentHomeworksRepository } from './student-homeworks.repository.js'
import { HomeworkSubmissionStorage } from './homework-submission.storage.js'
import { LegacyHomeworkSubmissionStorage } from './legacy-homework-submission.storage.js'
import { SubmitHomeworkController } from './submit-homework.controller.js'
import { SubmitHomeworkGuard } from './submit-homework.guard.js'
import { SubmitHomeworkUseCase } from './submit-homework.use-case.js'

@Module({
  imports: [AuthModule, NotificationsModule, PersistenceModule, StorageModule],
  controllers: [StudentHomeworksController, SubmitHomeworkController],
  providers: [
    ListStudentHomeworksUseCase,
    SubmitHomeworkGuard,
    SubmitHomeworkUseCase,
    {
      provide: HomeworkSubmissionStorage,
      useClass: LegacyHomeworkSubmissionStorage,
    },
    {
      provide: StudentHomeworksRepository,
      useClass: PrismaStudentHomeworksRepository,
    },
  ],
})
export class StudentHomeworksModule {}
