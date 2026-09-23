import {
  Controller,
  Get,
  Inject,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { parsePositiveId } from '../common/parse-positive-id.js'
import { GetStudentAvatarUseCase } from './get-student-avatar.use-case.js'

@Controller(['api/students', 'students'])
@UseGuards(AuthenticationGuard)
export class StudentProfileAvatarsController {
  constructor(
    @Inject(GetStudentAvatarUseCase)
    private readonly getStudentAvatar: GetStudentAvatarUseCase,
  ) {}

  @Get(':student_id/avatar')
  async showStudentAvatar(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('student_id') studentId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const stream = await this.getStudentAvatar.executeForStudent(
      principal,
      parsePositiveId(studentId),
    )
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.header('Cache-Control', 'private, max-age=3600')
    reply.type('image/jpeg')
    return new StreamableFile(stream)
  }
}
