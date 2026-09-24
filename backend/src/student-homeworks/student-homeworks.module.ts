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
import { LocalHomeworkSubmissionStorage } from './local-homework-submission.storage.js'
import { SubmitHomeworkController } from './submit-homework.controller.js'
import { SubmitHomeworkGuard } from './submit-homework.guard.js'
import { SubmitHomeworkUseCase } from './submit-homework.use-case.js'
import { HomeworkRevisionController } from './homework-revision.controller.js'
import { HomeworkEditController } from './homework-edit.controller.js'
import { HomeworkEditGuard } from './homework-edit.guard.js'
import { EditPendingHomeworkUseCase } from './edit-pending-homework.use-case.js'
import { HomeworkRevisionGuard } from './homework-revision.guard.js'
import { SubmitHomeworkRevisionUseCase } from './submit-homework-revision.use-case.js'

@Module({
  imports: [AuthModule, NotificationsModule, PersistenceModule, StorageModule],
  controllers: [StudentHomeworksController, SubmitHomeworkController, HomeworkRevisionController, HomeworkEditController],
  providers: [
    ListStudentHomeworksUseCase,
    SubmitHomeworkGuard,
    SubmitHomeworkUseCase,
    HomeworkRevisionGuard,
    SubmitHomeworkRevisionUseCase,
    HomeworkEditGuard,
    EditPendingHomeworkUseCase,
    {
      provide: HomeworkSubmissionStorage,
      useClass: LocalHomeworkSubmissionStorage,
    },
    {
      provide: StudentHomeworksRepository,
      useClass: PrismaStudentHomeworksRepository,
    },
  ],
})
export class StudentHomeworksModule {}
