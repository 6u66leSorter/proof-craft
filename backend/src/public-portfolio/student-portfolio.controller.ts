import { Controller, Get, HttpException, HttpStatus, Inject, Param } from '@nestjs/common'
import { GetStudentPortfolioUseCase } from './get-student-portfolio.use-case.js'

const parseStudentId = (value: string): number => {
  const studentId = Number(value)
  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    throw new HttpException(
      { ok: false, error: 'Некорректные параметры запроса.' },
      HttpStatus.BAD_REQUEST,
    )
  }
  return studentId
}

@Controller(['api/guest/students', 'guest/students'])
export class StudentPortfolioController {
  constructor(
    @Inject(GetStudentPortfolioUseCase)
    private readonly getStudentPortfolio: GetStudentPortfolioUseCase,
  ) {}

  @Get(':student_id/portfolio')
  async show(@Param('student_id') studentId: string): Promise<object> {
    return await this.getStudentPortfolio.execute(parseStudentId(studentId))
  }
}
