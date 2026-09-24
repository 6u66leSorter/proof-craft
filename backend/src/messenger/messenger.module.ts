import { Module } from '@nestjs/common'
import { AdminModule } from '../admin/admin.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { PrismaModule } from '../persistence/prisma/prisma.module.js'
import { TeacherCabinetModule } from '../teacher-cabinet/teacher-cabinet.module.js'
import { WebAuthModule } from '../web-auth/web-auth.module.js'
import { BotRouter } from './bot.router.js'
import { ConversationStore } from './conversation.store.js'
import { FeedbackInvitesWorker } from './feedback-invites.worker.js'
import { MessengerIdentityService } from './messenger-identity.service.js'
import { AdminScenario } from './scenarios/admin.scenario.js'
import { StartScenario } from './scenarios/start.scenario.js'
import { TeacherScenario } from './scenarios/teacher.scenario.js'
import { TelegramAdapter } from './telegram/telegram.adapter.js'

/** Бот: мессенджер-независимые сценарии и адаптеры мессенджеров. Запускается отдельным процессом (bot-main.ts). */
@Module({
  imports: [AdminModule, TeacherCabinetModule, WebAuthModule, PersistenceModule, PrismaModule],
  providers: [BotRouter, ConversationStore, MessengerIdentityService, StartScenario, AdminScenario, TeacherScenario, TelegramAdapter, FeedbackInvitesWorker],
  exports: [TelegramAdapter, FeedbackInvitesWorker],
})
export class MessengerModule {}
