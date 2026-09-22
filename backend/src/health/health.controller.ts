import { Controller, Get } from '@nestjs/common'

@Controller()
export class HealthController {
  @Get('health')
  getHealth(): { ok: true } {
    return { ok: true }
  }
}
