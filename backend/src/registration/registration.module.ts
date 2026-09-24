import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { PrismaRegistrationRepository } from './prisma-registration.repository.js'
import { RegistrationController } from './registration.controller.js'
import { RegistrationRepository } from './registration.repository.js'
import { SubmitTeacherApplicationUseCase } from './submit-teacher-application.use-case.js'
import { TeacherApplicationGuard } from './teacher-application.guard.js'

@Module({
  imports: [AuthModule, NotificationsModule, PersistenceModule],
  controllers: [RegistrationController],
  providers: [
    TeacherApplicationGuard,
    SubmitTeacherApplicationUseCase,
    {
      provide: RegistrationRepository,
      useClass: PrismaRegistrationRepository,
    },
  ],
})
export class RegistrationModule {}
