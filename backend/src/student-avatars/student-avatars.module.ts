import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { GetStudentAvatarUseCase } from './get-student-avatar.use-case.js'
import { PrismaStudentAvatarRepository } from './prisma-student-avatar.repository.js'
import { StudentAvatarRepository } from './student-avatar.repository.js'
import { StudentAvatarsController } from './student-avatars.controller.js'
import { StudentProfileAvatarsController } from './student-profile-avatars.controller.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [StudentAvatarsController, StudentProfileAvatarsController],
  providers: [
    GetStudentAvatarUseCase,
    {
      provide: StudentAvatarRepository,
      useClass: PrismaStudentAvatarRepository,
    },
  ],
})
export class StudentAvatarsModule {}
