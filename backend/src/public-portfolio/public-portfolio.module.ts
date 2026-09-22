import { Module } from '@nestjs/common'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { ListPortfolioStudentsUseCase } from './list-portfolio-students.use-case.js'
import { PortfolioStudentsController } from './portfolio-students.controller.js'
import { PortfolioStudentsRepository } from './portfolio-students.repository.js'
import { PrismaPortfolioStudentsRepository } from './prisma-portfolio-students.repository.js'

@Module({
  imports: [PersistenceModule],
  controllers: [PortfolioStudentsController],
  providers: [
    ListPortfolioStudentsUseCase,
    {
      provide: PortfolioStudentsRepository,
      useClass: PrismaPortfolioStudentsRepository,
    },
  ],
})
export class PublicPortfolioModule {}
