import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { PrismaRegistrationRepository } from './prisma-registration.repository.js'
import { RegistrationController } from './registration.controller.js'
import { RegistrationRepository } from './registration.repository.js'
import { SubmitTeacherApplicationUseCase } from './submit-teacher-application.use-case.js'
import { TeacherApplicationGuard } from './teacher-application.guard.js'
import { RegisterStudentUseCase } from './register-student.use-case.js'
import { StudentFeedbackGuard } from './student-feedback.guard.js'
import { StudentRegistrationGuard } from './student-registration.guard.js'
import { SubmitStudentFeedbackUseCase } from './submit-student-feedback.use-case.js'

@Module({
  imports: [AuthModule, NotificationsModule, PersistenceModule],
  controllers: [RegistrationController],
  providers: [
    TeacherApplicationGuard,
    StudentRegistrationGuard,
    StudentFeedbackGuard,
    SubmitTeacherApplicationUseCase,
    RegisterStudentUseCase,
    SubmitStudentFeedbackUseCase,
    {
      provide: RegistrationRepository,
      useClass: PrismaRegistrationRepository,
    },
  ],
})
export class RegistrationModule {}
