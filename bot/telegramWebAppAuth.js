import crypto from 'crypto'
import { Buffer } from 'buffer'

const MAX_AUTH_AGE_SEC = Number(process.env.TG_INIT_DATA_MAX_AGE_SEC || 86400)

/**
 * Проверка подписи initData мини-приложения Telegram.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export const parseAndValidateTelegramWebAppInitData = (initDataRaw, botToken) => {
  if (!initDataRaw || !botToken) {
    return null
  }

  const params = new URLSearchParams(initDataRaw)
  const hash = params.get('hash')
  if (!hash) {
    return null
  }

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SEC) {
    return null
  }

  const keys = [...params.keys()].filter((k) => k !== 'hash').sort()
  const dataCheckString = keys.map((k) => `${k}=${params.get(k)}`).join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  let hashBuf
  let computedBuf
  try {
    hashBuf = Buffer.from(hash, 'hex')
    computedBuf = Buffer.from(computed, 'hex')
  } catch {
    return null
  }
  if (hashBuf.length !== computedBuf.length || !crypto.timingSafeEqual(hashBuf, computedBuf)) {
    return null
  }

  const userJson = params.get('user')
  if (!userJson) {
    return null
  }
  let user
  try {
    user = JSON.parse(userJson)
  } catch {
    return null
  }
  if (!user?.id || !Number.isFinite(Number(user.id))) {
    return null
  }

  return { telegramUserId: Number(user.id), user }
}
