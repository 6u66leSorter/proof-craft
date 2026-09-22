import { Module } from '@nestjs/common'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { GetStudentAvatarUseCase } from './get-student-avatar.use-case.js'
import { GetPublicHomeworkFileUseCase } from './get-public-homework-file.use-case.js'
import { GetStudentPortfolioUseCase } from './get-student-portfolio.use-case.js'
import { ListPortfolioStudentsUseCase } from './list-portfolio-students.use-case.js'
import { PortfolioStudentsController } from './portfolio-students.controller.js'
import { PortfolioStudentsRepository } from './portfolio-students.repository.js'
import { PrismaPortfolioStudentsRepository } from './prisma-portfolio-students.repository.js'
import { PrismaPublicHomeworkFileRepository } from './prisma-public-homework-file.repository.js'
import { PrismaStudentAvatarRepository } from './prisma-student-avatar.repository.js'
import { PrismaStudentPortfolioRepository } from './prisma-student-portfolio.repository.js'
import { StudentAvatarController } from './student-avatar.controller.js'
import { StudentAvatarRepository } from './student-avatar.repository.js'
import { StudentPortfolioController } from './student-portfolio.controller.js'
import { StudentPortfolioRepository } from './student-portfolio.repository.js'
import { PublicHomeworkFileController } from './public-homework-file.controller.js'
import { PublicHomeworkFileRepository } from './public-homework-file.repository.js'

@Module({
  imports: [PersistenceModule, StorageModule],
  controllers: [
    PortfolioStudentsController,
    PublicHomeworkFileController,
    StudentAvatarController,
    StudentPortfolioController,
  ],
  providers: [
    GetPublicHomeworkFileUseCase,
    GetStudentAvatarUseCase,
    GetStudentPortfolioUseCase,
    ListPortfolioStudentsUseCase,
    {
      provide: PortfolioStudentsRepository,
      useClass: PrismaPortfolioStudentsRepository,
    },
    {
      provide: StudentPortfolioRepository,
      useClass: PrismaStudentPortfolioRepository,
    },
    {
      provide: StudentAvatarRepository,
      useClass: PrismaStudentAvatarRepository,
    },
    {
      provide: PublicHomeworkFileRepository,
      useClass: PrismaPublicHomeworkFileRepository,
    },
  ],
})
export class PublicPortfolioModule {}
