import { type DynamicModule, Module } from '@nestjs/common';

import {
  DOCUMENT_EXTRACTOR,
  WEBPAGE_EXTRACTOR,
  type DocumentExtractor,
  type WebpageExtractor,
} from './material-extractor.js';
import { MaterialController } from './material.controller.js';
import { MATERIAL_REPOSITORY, type MaterialRepository } from './material.repository.js';
import { MaterialService } from './material.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider.js';

@Module({})
export class MaterialModule {
  static register(
    repository: MaterialRepository,
    storage: StorageProvider,
    documentExtractor: DocumentExtractor,
    webpageExtractor: WebpageExtractor,
    identityModule: DynamicModule,
  ): DynamicModule {
    return {
      module: MaterialModule,
      imports: [identityModule],
      controllers: [MaterialController],
      providers: [
        MaterialService,
        { provide: MATERIAL_REPOSITORY, useValue: repository },
        { provide: STORAGE_PROVIDER, useValue: storage },
        { provide: DOCUMENT_EXTRACTOR, useValue: documentExtractor },
        { provide: WEBPAGE_EXTRACTOR, useValue: webpageExtractor },
      ],
    };
  }
}
