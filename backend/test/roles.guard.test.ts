import assert from 'node:assert/strict'
import test from 'node:test'
import { HttpException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthenticationRequest } from '../src/auth/auth.types.js'
import { REQUIRED_ROLES } from '../src/auth/require-roles.decorator.js'
import { RolesGuard } from '../src/auth/roles.guard.js'

const createContext = (roles: string[], requiredRoles: string[]): ExecutionContext => {
  const handler = () => undefined
  Reflect.defineMetadata(REQUIRED_ROLES, requiredRoles, handler)
  const request: AuthenticationRequest = {
    headers: {},
    authenticatedPrincipal: {
      provider: 'telegram',
      claimedTelegramId: 1,
      user: { id: 1, telegramId: 1, vkUserId: null, roles },
    },
  }
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

test('RolesGuard разрешает любую из требуемых ролей', () => {
  const guard = new RolesGuard(new Reflector())
  assert.equal(guard.canActivate(createContext(['student', 'admin'], ['admin'])), true)
})

test('RolesGuard возвращает совместимую 403-ошибку при недостаточных правах', () => {
  const guard = new RolesGuard(new Reflector())
  assert.throws(
    () => guard.canActivate(createContext(['student'], ['admin', 'teacher'])),
    (error: unknown) => {
      assert.ok(error instanceof HttpException)
      assert.equal(error.getStatus(), 403)
      assert.deepEqual(error.getResponse(), {
        ok: false,
        error: 'Недостаточно прав для выполнения операции.',
      })
      return true
    },
  )
})
