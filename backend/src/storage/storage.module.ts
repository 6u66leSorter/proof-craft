import { Module } from '@nestjs/common'
import { FileReferenceService } from './file-reference.service.js'
import { LocalFileReferenceService } from './local-file-reference.service.js'

@Module({
  providers: [
    {
      provide: FileReferenceService,
      useClass: LocalFileReferenceService,
    },
  ],
  exports: [FileReferenceService],
})
export class StorageModule {}
