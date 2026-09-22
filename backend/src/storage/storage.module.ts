import { Module } from '@nestjs/common'
import { FileReferenceService } from './file-reference.service.js'
import { LegacyFileReferenceService } from './legacy-file-reference.service.js'

@Module({
  providers: [
    {
      provide: FileReferenceService,
      useClass: LegacyFileReferenceService,
    },
  ],
  exports: [FileReferenceService],
})
export class StorageModule {}
