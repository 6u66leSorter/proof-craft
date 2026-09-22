import { HttpException, HttpStatus } from '@nestjs/common'

export const parseStudentId = (value: string): number => {
  const studentId = Number(value)
  if (!Number.isSafeInteger(studentId) || studentId <= 0) {
    throw new HttpException(
      { ok: false, error: 'Некорректные параметры запроса.' },
      HttpStatus.BAD_REQUEST,
    )
  }
  return studentId
}
