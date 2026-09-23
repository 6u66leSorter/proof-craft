import { Controller, Get, Inject, Res, StreamableFile, UseGuards } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import { GetOwnStudentAvatarUseCase } from './get-own-student-avatar.use-case.js'

@Controller(['api/student', 'student'])
@UseGuards(AuthenticationGuard)
export class StudentAvatarsController {
  constructor(
    @Inject(GetOwnStudentAvatarUseCase)
    private readonly getOwnAvatar: GetOwnStudentAvatarUseCase,
  ) {}

  @Get('me/avatar')
  async showOwnAvatar(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const stream = await this.getOwnAvatar.execute(principal)
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.header('Cache-Control', 'private, max-age=3600')
    reply.type('image/jpeg')
    return new StreamableFile(stream)
  }
}
