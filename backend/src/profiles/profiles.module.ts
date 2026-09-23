import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { NotificationsModule } from '../notifications/notifications.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { AboutGuard } from './about.guard.js'
import { PrismaProfilesRepository } from './prisma-profiles.repository.js'
import { ProfileEditGuard } from './profile-edit.guard.js'
import { ProfilesRepository } from './profiles.repository.js'
import { StudentProfileController } from './student-profile.controller.js'
import { TeacherProfileController } from './teacher-profile.controller.js'
import { SubmitStudentProfileEditUseCase } from './submit-student-profile-edit.use-case.js'
import { UpdateStudentAboutUseCase } from './update-student-about.use-case.js'
import { UpdateTeacherAboutUseCase } from './update-teacher-about.use-case.js'

@Module({
  imports: [AuthModule, NotificationsModule, PersistenceModule],
  controllers: [StudentProfileController, TeacherProfileController],
  providers: [
    AboutGuard,
    ProfileEditGuard,
    SubmitStudentProfileEditUseCase,
    UpdateStudentAboutUseCase,
    UpdateTeacherAboutUseCase,
    {
      provide: ProfilesRepository,
      useClass: PrismaProfilesRepository,
    },
  ],
})
export class ProfilesModule {}
