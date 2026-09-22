import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { GetSessionUseCase } from './get-session.use-case.js'
import { PrismaSessionRepository } from './prisma-session.repository.js'
import { SessionController } from './session.controller.js'
import { SessionRepository } from './session.repository.js'

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [SessionController],
  providers: [
    GetSessionUseCase,
    {
      provide: SessionRepository,
      useClass: PrismaSessionRepository,
    },
  ],
})
export class SessionModule {}
