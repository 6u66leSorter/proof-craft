import { Module } from '@nestjs/common'
import { HealthModule } from './health/health.module.js'
import { PublicPortfolioModule } from './public-portfolio/public-portfolio.module.js'
import { SessionModule } from './session/session.module.js'
import { ShowcaseModule } from './showcase/showcase.module.js'

@Module({
  imports: [HealthModule, PublicPortfolioModule, SessionModule, ShowcaseModule],
})
export class AppModule {}
