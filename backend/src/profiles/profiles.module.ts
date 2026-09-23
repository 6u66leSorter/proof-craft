import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { AboutGuard } from './about.guard.js'
import { PrismaProfilesRepository } from './prisma-profiles.repository.js'
import { ProfilesRepository } from './profiles.repository.js'
import { StudentProfileController } from './student-profile.controller.js'
import { TeacherProfileController } from './teacher-profile.controller.js'
import { UpdateStudentAboutUseCase } from './update-student-about.use-case.js'
import { UpdateTeacherAboutUseCase } from './update-teacher-about.use-case.js'

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [StudentProfileController, TeacherProfileController],
  providers: [
    AboutGuard,
    UpdateStudentAboutUseCase,
    UpdateTeacherAboutUseCase,
    {
      provide: ProfilesRepository,
      useClass: PrismaProfilesRepository,
    },
  ],
})
export class ProfilesModule {}
