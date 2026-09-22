import { Module } from '@nestjs/common'
import { PersistenceModule } from '../persistence/persistence.module.js'
import { AuthenticationGuard } from './authentication.guard.js'
import { AuthenticationService } from './authentication.service.js'
import { RolesGuard } from './roles.guard.js'
import { TelegramInitDataService } from './telegram-init-data.service.js'
import { VkLaunchParamsService } from './vk-launch-params.service.js'

@Module({
  imports: [PersistenceModule],
  providers: [
    AuthenticationService,
    AuthenticationGuard,
    RolesGuard,
    TelegramInitDataService,
    VkLaunchParamsService,
  ],
  exports: [AuthenticationService, AuthenticationGuard, RolesGuard],
})
export class AuthModule {}
