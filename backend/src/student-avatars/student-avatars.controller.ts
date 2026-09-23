import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { GetStudentAvatarUseCase } from './get-student-avatar.use-case.js'
import { AvatarFileTooLargeError } from './student-avatar-storage.js'
import { UploadStudentAvatarUseCase } from './upload-student-avatar.use-case.js'

const isMultipartLimitError = (error: unknown): boolean =>
  error instanceof AvatarFileTooLargeError ||
  (error as { code?: unknown } | null)?.code === 'FST_REQ_FILE_TOO_LARGE'

@Controller(['api/student', 'student'])
@UseGuards(AuthenticationGuard)
export class StudentAvatarsController {
  constructor(
    @Inject(GetStudentAvatarUseCase)
    private readonly getStudentAvatar: GetStudentAvatarUseCase,
    @Inject(UploadStudentAvatarUseCase)
    private readonly uploadStudentAvatar: UploadStudentAvatarUseCase,
  ) {}

  @Get('me/avatar')
  async showOwnAvatar(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const stream = await this.getStudentAvatar.executeOwn(principal)
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.header('Cache-Control', 'private, max-age=3600')
    reply.type('image/jpeg')
    return new StreamableFile(stream)
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  async uploadOwnAvatar(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true }> {
    const target = await this.uploadStudentAvatar.resolveTarget(principal)
    try {
      const upload = await request.file()
      if (!upload) {
        throw new HttpException(
          { ok: false, error: 'Файл не получен.' },
          HttpStatus.BAD_REQUEST,
        )
      }
      await this.uploadStudentAvatar.replace(
        target,
        upload.file,
        () => upload.file.truncated,
      )
      return { ok: true }
    } catch (error) {
      if (error instanceof HttpException) throw error
      if (isMultipartLimitError(error)) {
        throw new HttpException(
          { ok: false, error: 'Файл слишком большой.' },
          HttpStatus.BAD_REQUEST,
        )
      }
      throw new HttpException(
        { ok: false, error: 'Ошибка загрузки файла.' },
        HttpStatus.BAD_REQUEST,
      )
    }
  }
}
