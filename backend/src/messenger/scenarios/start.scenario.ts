import crypto from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { sqliteTimestamp } from '../../common/sqlite-timestamp.js'
import { WebAuthRepository } from '../../web-auth/web-auth.repository.js'
import type { ScenarioContext } from '../scenario.context.js'

/** `/start` и подтверждение входа на сайт по ссылке `webauth_<token>` (legacy registrationBot). */
@Injectable()
export class StartScenario {
  constructor(@Inject(WebAuthRepository) private readonly webAuth: WebAuthRepository) {}

  async start(context: ScenarioContext, args: string): Promise<void> {
    const payload = args.trim()
    const token = payload.startsWith('webauth_') ? payload.slice('webauth_'.length) : ''
    if (token && context.principal.user) {
      const tokenHash = crypto.createHash('sha256').update(token.trim(), 'utf8').digest('hex')
      const approved = await this.webAuth.approveLoginRequest(tokenHash, 'telegram', context.principal.user.id, sqliteTimestamp())
      await context.reply(
        approved
          ? 'Вход подтверждён. Вернитесь в браузер — дневник откроется автоматически.'
          : 'Ссылка для входа истекла или уже была использована. Вернитесь на сайт и начните вход заново.',
      )
      return
    }
    await context.reply('Привет! Чтобы войти в приложение, нажми на кнопку «Дневник» в левом нижнем углу.')
  }
}
