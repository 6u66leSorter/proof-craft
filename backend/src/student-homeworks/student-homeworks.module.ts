import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { ListStudentHomeworksUseCase } from './list-student-homeworks.use-case.js'
import { PrismaStudentHomeworksRepository } from './prisma-student-homeworks.repository.js'
import { StudentHomeworksController } from './student-homeworks.controller.js'
import { StudentHomeworksRepository } from './student-homeworks.repository.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [StudentHomeworksController],
  providers: [
    ListStudentHomeworksUseCase,
    {
      provide: StudentHomeworksRepository,
      useClass: PrismaStudentHomeworksRepository,
    },
  ],
})
export class StudentHomeworksModule {}
