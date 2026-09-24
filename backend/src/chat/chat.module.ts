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
  ChatMessageMultipartGuard,
} from './chat.guards.js'
import { ChatRepository } from './chat.repository.js'
import {
  ListChatMessagesUseCase,
  ListChatStudentsUseCase,
} from './chat.use-cases.js'
import { GetChatMessageFileUseCase } from './get-chat-message-file.use-case.js'
import { PrismaChatRepository } from './prisma-chat.repository.js'
import { ChatAttachmentStorage } from './chat-attachment.storage.js'
import { LocalChatAttachmentStorage } from './local-chat-attachment.storage.js'
import { SendChatMessageUseCase } from './send-chat-message.use-case.js'

@Module({
  imports: [AuthModule, PersistenceModule, StorageModule],
  controllers: [ChatController],
  providers: [
    ChatAccessPolicy,
    ChatAvailabilityGuard,
    ChatMessageFileGuard,
    ChatMessagesQueryGuard,
    ChatMessageMultipartGuard,
    GetChatMessageFileUseCase,
    ListChatMessagesUseCase,
    ListChatStudentsUseCase,
    SendChatMessageUseCase,
    { provide: ChatRepository, useClass: PrismaChatRepository },
    { provide: ChatAttachmentStorage, useClass: LocalChatAttachmentStorage },
  ],
})
export class ChatModule {}
