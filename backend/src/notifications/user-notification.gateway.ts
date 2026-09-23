export abstract class UserNotificationGateway {
  abstract send(telegramId: number, message: string): Promise<void>
}
