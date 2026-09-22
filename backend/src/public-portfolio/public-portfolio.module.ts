import { Module } from '@nestjs/common'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { GetStudentPortfolioUseCase } from './get-student-portfolio.use-case.js'
import { ListPortfolioStudentsUseCase } from './list-portfolio-students.use-case.js'
import { PortfolioStudentsController } from './portfolio-students.controller.js'
import { PortfolioStudentsRepository } from './portfolio-students.repository.js'
import { PrismaPortfolioStudentsRepository } from './prisma-portfolio-students.repository.js'
import { PrismaStudentPortfolioRepository } from './prisma-student-portfolio.repository.js'
import { StudentPortfolioController } from './student-portfolio.controller.js'
import { StudentPortfolioRepository } from './student-portfolio.repository.js'

@Module({
  imports: [PersistenceModule, StorageModule],
  controllers: [PortfolioStudentsController, StudentPortfolioController],
  providers: [
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
  ],
})
export class PublicPortfolioModule {}
