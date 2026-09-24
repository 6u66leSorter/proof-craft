import { HttpException, Inject, Injectable, Logger } from '@nestjs/common'
import type { ChannelPort, IncomingEvent, OutgoingMessage } from './channel.types.js'
import { ConversationStore } from './conversation.store.js'
import { MessengerIdentityService } from './messenger-identity.service.js'
import type { ScenarioContext } from './scenario.context.js'
import { AdminScenario } from './scenarios/admin.scenario.js'
import { StartScenario } from './scenarios/start.scenario.js'
import { TeacherScenario } from './scenarios/teacher.scenario.js'

const errorText = (error: unknown): string | null => {
  if (!(error instanceof HttpException)) return null
  const response = error.getResponse() as { error?: unknown }
  return typeof response?.error === 'string' ? response.error : null
}

/** Раздаёт события адаптеров сценариям. Ошибки use cases показываются пользователю их текстом. */
@Injectable()
export class BotRouter {
  private readonly logger = new Logger(BotRouter.name)

  constructor(
    @Inject(MessengerIdentityService) private readonly identity: MessengerIdentityService,
    @Inject(ConversationStore) private readonly conversations: ConversationStore,
    @Inject(StartScenario) private readonly start: StartScenario,
    @Inject(AdminScenario) private readonly admin: AdminScenario,
    @Inject(TeacherScenario) private readonly teacher: TeacherScenario,
  ) {}

  async handle(channel: ChannelPort, event: IncomingEvent): Promise<void> {
    const principal = await this.identity.resolve(event.user)
    const context: ScenarioContext = {
      channel,
      user: event.user,
      chatId: event.chatId,
      principal,
      reply: (message: OutgoingMessage | string) =>
        channel.send(event.chatId, typeof message === 'string' ? { text: message } : message),
    }
    let answered = false
    const answer = async (text?: string) => {
      if (answered || event.kind !== 'button') return
      answered = true
      await channel.answerButton(event.callbackId, text).catch(() => {})
    }
    try {
      await this.dispatch(context, event, answer)
    } catch (error) {
      const text = errorText(error)
      if (!text) this.logger.error(`Ошибка обработки ${event.kind}: ${error instanceof Error ? error.stack : String(error)}`)
      await context.reply(text ?? 'Произошла ошибка. Попробуйте позже.').catch(() => {})
    } finally {
      await answer()
    }
  }

  private async dispatch(context: ScenarioContext, event: IncomingEvent, answer: (text?: string) => Promise<void>): Promise<void> {
    if (event.kind === 'command') {
      if (event.command === 'start') return await this.start.start(context, event.args)
      if (event.command === 'admin') return await this.admin.menu(context)
      if (event.command === 'teacher') return await this.teacher.menu(context)
      return
    }
    if (event.kind === 'button') {
      if (await this.admin.handleButton(context, event.data, answer)) return
      await this.teacher.handleButton(context, event.data, answer)
      return
    }
    const conversation = this.conversations.get(context.channel.kind, context.chatId)
    if (!conversation) return
    if (conversation.type === 'admin') return await this.admin.handleTeacherIdInput(context, conversation.step, event.text)
    if (conversation.type === 'review') return await this.teacher.handleReviewInput(context, conversation, event.text)
  }
}
