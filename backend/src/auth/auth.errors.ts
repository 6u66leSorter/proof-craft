import { HttpException, HttpStatus } from '@nestjs/common'

export const authHttpError = (status: HttpStatus, error: string): HttpException =>
  new HttpException({ ok: false, error }, status)
