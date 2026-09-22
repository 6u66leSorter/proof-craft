import { HttpException, HttpStatus } from '@nestjs/common'

export const parsePositiveId = (value: string): number => {
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpException(
      { ok: false, error: 'Некорректные параметры запроса.' },
      HttpStatus.BAD_REQUEST,
    )
  }
  return id
}
