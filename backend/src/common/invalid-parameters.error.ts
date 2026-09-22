import { HttpException, HttpStatus } from '@nestjs/common'

export const invalidParameters = (): never => {
  throw new HttpException(
    { ok: false, error: 'Некорректные параметры запроса.' },
    HttpStatus.BAD_REQUEST,
  )
}
