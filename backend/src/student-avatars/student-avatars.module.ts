import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { GetStudentAvatarUseCase } from './get-student-avatar.use-case.js'
import { PrismaStudentAvatarRepository } from './prisma-student-avatar.repository.js'
import { LocalStudentAvatarStorage } from './local-student-avatar-storage.js'
import { StudentAvatarRepository } from './student-avatar.repository.js'
import { StudentAvatarStorage } from './student-avatar-storage.js'
import { StudentAvatarsController } from './student-avatars.controller.js'
import { StudentProfileAvatarsController } from './student-profile-avatars.controller.js'
import { UploadStudentAvatarUseCase } from './upload-student-avatar.use-case.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [StudentAvatarsController, StudentProfileAvatarsController],
  providers: [
    GetStudentAvatarUseCase,
    UploadStudentAvatarUseCase,
    {
      provide: StudentAvatarRepository,
      useClass: PrismaStudentAvatarRepository,
    },
    {
      provide: StudentAvatarStorage,
      useClass: LocalStudentAvatarStorage,
    },
  ],
})
export class StudentAvatarsModule {}
