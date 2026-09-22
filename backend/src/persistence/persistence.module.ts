import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module.js'
import { PrismaUserIdentityRepository } from './users/prisma-user-identity.repository.js'
import { UserIdentityRepository } from './users/user-identity.repository.js'

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: UserIdentityRepository,
      useClass: PrismaUserIdentityRepository,
    },
  ],
  exports: [UserIdentityRepository],
})
export class PersistenceModule {}
