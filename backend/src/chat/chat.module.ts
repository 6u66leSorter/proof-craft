import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { ChatAccessPolicy } from './chat-access.policy.js'
import { ChatController } from './chat.controller.js'
import {
  ChatAvailabilityGuard,
  ChatMessageFileGuard,
  ChatMessagesQueryGuard,
} from './chat.guards.js'
import { ChatRepository } from './chat.repository.js'
import {
  ListChatMessagesUseCase,
  ListChatStudentsUseCase,
} from './chat.use-cases.js'
import { GetChatMessageFileUseCase } from './get-chat-message-file.use-case.js'
import { PrismaChatRepository } from './prisma-chat.repository.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [ChatController],
  providers: [
    ChatAccessPolicy,
    ChatAvailabilityGuard,
    ChatMessageFileGuard,
    ChatMessagesQueryGuard,
    GetChatMessageFileUseCase,
    ListChatMessagesUseCase,
    ListChatStudentsUseCase,
    { provide: ChatRepository, useClass: PrismaChatRepository },
  ],
})
export class ChatModule {}
