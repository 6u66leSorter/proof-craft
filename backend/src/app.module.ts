import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module.js'
import { SessionModule } from './session/session.module.js'

@Module({
  imports: [HealthModule, SessionModule],
})
export class AppModule {}
