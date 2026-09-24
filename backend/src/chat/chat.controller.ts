import {
  Controller,
  Get,
  Inject,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { AuthenticationGuard } from '../auth/authentication.guard.js'
import { CurrentPrincipal } from '../auth/current-principal.decorator.js'
import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import {
  ChatAvailabilityGuard,
  ChatMessageFileGuard,
  ChatMessagesQueryGuard,
} from './chat.guards.js'
import {
  chatMessageIdFrom,
  chatMessagesQueryFrom,
  type ChatRequest,
} from './chat.request.js'
import {
  ListChatMessagesUseCase,
  ListChatStudentsUseCase,
} from './chat.use-cases.js'
import {
  GetChatMessageFileUseCase,
  type ChatMessageFileResponse,
} from './get-chat-message-file.use-case.js'

@Controller(['api/chats', 'chats'])
@UseGuards(ChatAvailabilityGuard)
export class ChatController {
  constructor(
    @Inject(ListChatStudentsUseCase)
    private readonly listStudents: ListChatStudentsUseCase,
    @Inject(ListChatMessagesUseCase)
    private readonly listMessages: ListChatMessagesUseCase,
    @Inject(GetChatMessageFileUseCase)
    private readonly getMessageFile: GetChatMessageFileUseCase,
  ) {}

  @Get('students')
  @UseGuards(AuthenticationGuard)
  async students(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<object> {
    return await this.listStudents.execute(principal)
  }

  @Get('messages')
  @UseGuards(ChatMessagesQueryGuard, AuthenticationGuard)
  async messages(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: ChatRequest,
  ): Promise<object> {
    return await this.listMessages.execute(principal, chatMessagesQueryFrom(request))
  }

  @Get('messages/:id/file')
  @UseGuards(ChatMessageFileGuard, AuthenticationGuard)
  async file(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Req() request: ChatRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    const file = await this.getMessageFile.execute(
      principal,
      chatMessageIdFrom(request),
    )
    return this.stream(reply, file)
  }

  private stream(
    reply: FastifyReply,
    file: ChatMessageFileResponse,
  ): StreamableFile {
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.type(file.contentType)
    return new StreamableFile(file.stream)
  }
}
