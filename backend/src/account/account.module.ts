import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module.js'
import { PrismaModule } from '../persistence/prisma/prisma.module.js'
import { AccountController } from './account.controller.js'
import { PrismaVkLinkRepository } from './prisma-vk-link.repository.js'
import { VkLinkRepository } from './vk-link.repository.js'
import { VkLinkUseCases } from './vk-link.use-cases.js'

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AccountController],
  providers: [VkLinkUseCases, { provide: VkLinkRepository, useClass: PrismaVkLinkRepository }],
})
export class AccountModule {}
