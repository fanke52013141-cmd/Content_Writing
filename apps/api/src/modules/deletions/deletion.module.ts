import { type DynamicModule, Module } from '@nestjs/common';

import { STORAGE_PROVIDER, type StorageProvider } from '../materials/storage.provider.js';
import { DeletionController } from './deletion.controller.js';
import { DELETION_REPOSITORY, type DeletionRepository } from './deletion.repository.js';
import { DeletionService } from './deletion.service.js';

@Module({})
export class DeletionModule {
  static register(
    repository: DeletionRepository,
    identityModule: DynamicModule,
    storageProvider: StorageProvider,
  ): DynamicModule {
    return {
      module: DeletionModule,
      imports: [identityModule],
      controllers: [DeletionController],
      providers: [
        DeletionService,
        { provide: DELETION_REPOSITORY, useValue: repository },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    };
  }
}
