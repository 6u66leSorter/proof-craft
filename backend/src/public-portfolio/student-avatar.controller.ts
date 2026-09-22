import { Controller, Get, Inject, Param, Res, StreamableFile } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { GetStudentAvatarUseCase } from './get-student-avatar.use-case.js'
import { parsePositiveId } from './parse-positive-id.js'

@Controller(['api/guest/students', 'guest/students'])
export class StudentAvatarController {
  constructor(
    @Inject(GetStudentAvatarUseCase)
    private readonly getStudentAvatar: GetStudentAvatarUseCase,
  ) {}

  @Get(':student_id/avatar')
  async show(
    @Param('student_id') studentId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const stream = await this.getStudentAvatar.execute(parsePositiveId(studentId))
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.header('Cache-Control', 'public, max-age=3600')
    reply.type('image/jpeg')
    return new StreamableFile(stream)
  }
}
