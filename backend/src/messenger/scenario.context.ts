import type { AuthenticatedPrincipal } from '../auth/auth.types.js'
import type { ChannelPort, ChannelUser, OutgoingMessage } from './channel.types.js'

/** Всё, что нужно сценарию для ответа в том чате, откуда пришло событие. */
export type ScenarioContext = {
  channel: ChannelPort
  user: ChannelUser
  chatId: number
  principal: AuthenticatedPrincipal
  reply: (message: OutgoingMessage | string) => Promise<void>
}

/** Ответ use case в виде `{ ok, data }`: сценарии читают только `data`. */
export const dataOf = <T>(response: object): T => (response as { data: T }).data
