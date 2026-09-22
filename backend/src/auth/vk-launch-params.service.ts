import crypto from 'node:crypto'
import { Injectable } from '@nestjs/common'

@Injectable()
export class VkLaunchParamsService {
  verify(raw: string, appSecret: string): boolean {
    if (!raw || !appSecret) return false

    const params = new URLSearchParams(raw)
    const receivedSignature = params.get('sign')
    if (!receivedSignature) return false

    const checkString = [...params.entries()]
      .filter(([key]) => key.startsWith('vk_'))
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('&')
    const computedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(checkString)
      .digest('base64url')
    const receivedBuffer = Buffer.from(receivedSignature)
    const computedBuffer = Buffer.from(computedSignature)
    return (
      receivedBuffer.length === computedBuffer.length &&
      crypto.timingSafeEqual(receivedBuffer, computedBuffer)
    )
  }
}
