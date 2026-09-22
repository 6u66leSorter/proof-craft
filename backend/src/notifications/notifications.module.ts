import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { ListNotificationsUseCase } from './list-notifications.use-case.js'
import { MarkNotificationsReadUseCase } from './mark-notifications-read.use-case.js'
import { NotificationsController } from './notifications.controller.js'
import { NotificationsRepository } from './notifications.repository.js'
import { NotificationsRetentionService } from './notifications-retention.service.js'
import { PrismaNotificationsRepository } from './prisma-notifications.repository.js'

@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [NotificationsController],
  providers: [
    ListNotificationsUseCase,
    MarkNotificationsReadUseCase,
    NotificationsRetentionService,
    {
      provide: NotificationsRepository,
      useClass: PrismaNotificationsRepository,
    },
  ],
})
export class NotificationsModule {}
