import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { AddHomeworkCommentUseCase } from './add-homework-comment.use-case.js'
import { HomeworkCommentRepository } from './homework-comment.repository.js'
import { HomeworkCommentsController } from './homework-comments.controller.js'
import { PrismaHomeworkCommentRepository } from './prisma-homework-comment.repository.js'

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [HomeworkCommentsController],
  providers: [
    AddHomeworkCommentUseCase,
    { provide: HomeworkCommentRepository, useClass: PrismaHomeworkCommentRepository },
  ],
})
export class HomeworkCommentsModule {}
