import crypto from 'node:crypto'
import { Injectable } from '@nestjs/common'

@Injectable()
export class TelegramInitDataService {
  parseAndValidate(raw: string, botToken: string, maxAgeSeconds: number): number | null {
    if (!raw || !botToken) return null

    const params = new URLSearchParams(raw)
    const hash = params.get('hash')
    if (!hash) return null

    const authDate = Number(params.get('auth_date'))
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > maxAgeSeconds) return null

    const keys = [...params.keys()].filter((key) => key !== 'hash').sort()
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n')
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
    const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
    const receivedBuffer = Buffer.from(hash, 'hex')
    const computedBuffer = Buffer.from(computed, 'hex')
    if (
      receivedBuffer.length !== computedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, computedBuffer)
    ) {
      return null
    }

    const userJson = params.get('user')
    if (!userJson) return null
    try {
      const user = JSON.parse(userJson) as { id?: unknown }
      const telegramUserId = Number(user.id)
      return telegramUserId > 0 && Number.isSafeInteger(telegramUserId) ? telegramUserId : null
    } catch {
      return null
    }
  }
}
