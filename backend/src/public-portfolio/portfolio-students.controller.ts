import { Controller, Get, Inject } from '@nestjs/common'
import { ListPortfolioStudentsUseCase } from './list-portfolio-students.use-case.js'

@Controller(['api/guest', 'guest'])
export class PortfolioStudentsController {
  constructor(
    @Inject(ListPortfolioStudentsUseCase)
    private readonly listPortfolioStudents: ListPortfolioStudentsUseCase,
  ) {}

  @Get('portfolio-students')
  async list(): Promise<object> {
    return await this.listPortfolioStudents.execute()
  }
}
