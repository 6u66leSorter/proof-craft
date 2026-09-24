import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { AuthenticationRequest } from '../auth/auth.types.js'
import { invalidParameters } from '../common/invalid-parameters.error.js'

const header = (value: string | string[] | undefined): string => (Array.isArray(value) ? String(value[0] ?? '') : String(value ?? ''))

export type VkLinkConfirmRequest = AuthenticationRequest & { vkLinkCode?: string }

/** Код выдаётся только вне VK, и эта проверка идёт раньше разбора тела и подписи. */
@Injectable()
export class VkLinkTokenPlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticationRequest>()
    if (header(request.headers['x-client-platform']).toLowerCase() === 'vk') {
      throw new HttpException({ ok: false, error: 'Код выдаётся только из мини-приложения Telegram.' }, HttpStatus.FORBIDDEN)
    }
    return true
  }
}

/** `token` — ровно четыре цифры; проверяется до подписи запроса. */
@Injectable()
export class VkLinkConfirmBodyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<VkLinkConfirmRequest>()
    const token = (request.body as { token?: unknown } | null)?.token
    if (typeof token !== 'string' || !/^[0-9]{4}$/.test(token)) return invalidParameters()
    request.vkLinkCode = token
    return true
  }
}

export const vkUserIdFromRequest = (request: AuthenticationRequest): number | null => {
  if (header(request.headers['x-client-platform']).toLowerCase() !== 'vk') return null
  const vkUserId = Number(header(request.headers['x-vk-user-id']))
  return Number.isFinite(vkUserId) && vkUserId > 0 ? vkUserId : null
}
