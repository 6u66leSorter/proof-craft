import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { PrismaTeacherCabinetRepository } from './prisma-teacher-cabinet.repository.js'
import { TeacherCabinetController } from './teacher-cabinet.controller.js'
import { TeacherCabinetRepository } from './teacher-cabinet.repository.js'
import {
  GetTeacherDashboardUseCase,
  GetTeacherStudentHomeworksUseCase,
  ListTeacherStudentsUseCase,
} from './teacher-cabinet.use-cases.js'
import { TeacherStudentHomeworksGuard } from './teacher-student-homeworks.guard.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [TeacherCabinetController],
  providers: [
    GetTeacherDashboardUseCase,
    GetTeacherStudentHomeworksUseCase,
    ListTeacherStudentsUseCase,
    TeacherStudentHomeworksGuard,
    {
      provide: TeacherCabinetRepository,
      useClass: PrismaTeacherCabinetRepository,
    },
  ],
})
export class TeacherCabinetModule {}
