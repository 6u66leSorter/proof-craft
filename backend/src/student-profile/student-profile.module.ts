import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { PrismaStudentProfileRepository } from './prisma-student-profile.repository.js'
import { StudentAboutGuard } from './student-about.guard.js'
import { StudentProfileController } from './student-profile.controller.js'
import { StudentProfileRepository } from './student-profile.repository.js'
import { UpdateStudentAboutUseCase } from './update-student-about.use-case.js'

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [StudentProfileController],
  providers: [
    StudentAboutGuard,
    UpdateStudentAboutUseCase,
    {
      provide: StudentProfileRepository,
      useClass: PrismaStudentProfileRepository,
    },
  ],
})
export class StudentProfileModule {}
