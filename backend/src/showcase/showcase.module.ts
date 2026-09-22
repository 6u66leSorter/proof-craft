import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { GetShowcaseHomeworkFileUseCase } from './get-showcase-homework-file.use-case.js'
import { ListShowcaseHomeworksUseCase } from './list-showcase-homeworks.use-case.js'
import { PrismaShowcaseRepository } from './prisma-showcase.repository.js'
import { ShowcaseController } from './showcase.controller.js'
import { ShowcaseRepository } from './showcase.repository.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [ShowcaseController],
  providers: [
    GetShowcaseHomeworkFileUseCase,
    ListShowcaseHomeworksUseCase,
    {
      provide: ShowcaseRepository,
      useClass: PrismaShowcaseRepository,
    },
  ],
})
export class ShowcaseModule {}
