import { Controller, Get, Inject, Param } from '@nestjs/common'
import { parsePositiveId } from '../common/parse-positive-id.js'
import { GetStudentPortfolioUseCase } from './get-student-portfolio.use-case.js'

@Controller(['api/guest/students', 'guest/students'])
export class StudentPortfolioController {
  constructor(
    @Inject(GetStudentPortfolioUseCase)
    private readonly getStudentPortfolio: GetStudentPortfolioUseCase,
  ) {}

  @Get(':student_id/portfolio')
  async show(@Param('student_id') studentId: string): Promise<object> {
    return await this.getStudentPortfolio.execute(parsePositiveId(studentId))
  }
}
