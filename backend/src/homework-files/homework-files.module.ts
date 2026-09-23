import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { GetHomeworkFileUseCase } from './get-homework-file.use-case.js'
import { HomeworkFileRepository } from './homework-file.repository.js'
import { HomeworkFilesController } from './homework-files.controller.js'
import { PrismaHomeworkFileRepository } from './prisma-homework-file.repository.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [HomeworkFilesController],
  providers: [
    GetHomeworkFileUseCase,
    {
      provide: HomeworkFileRepository,
      useClass: PrismaHomeworkFileRepository,
    },
  ],
})
export class HomeworkFilesModule {}
