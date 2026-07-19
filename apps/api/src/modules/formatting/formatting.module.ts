import type { DynamicModule, ModuleMetadata } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ARTICLE_REPOSITORY, type ArticleRepository } from '../articles/article.repository.js';
import { type StorageProvider, STORAGE_PROVIDER } from '../materials/storage.provider.js';
import { FormattingController } from './formatting.controller.js';
import { EXPORT_REPOSITORY, type ArticleExportRepository } from './export.repository.js';
import { IMAGE_REPOSITORY, type ImageAssetRepository } from './image.repository.js';
import { FormattingService } from './formatting.service.js';

@Module({})
export class FormattingModule {
  static register(
    articleRepository: ArticleRepository,
    imageRepository: ImageAssetRepository,
    exportRepository: ArticleExportRepository,
    storageProvider: StorageProvider,
    identityModule: DynamicModule,
  ): DynamicModule {
    const metadata: ModuleMetadata = {
      imports: [identityModule],
      controllers: [FormattingController],
      providers: [
        FormattingService,
        { provide: ARTICLE_REPOSITORY, useValue: articleRepository },
        { provide: IMAGE_REPOSITORY, useValue: imageRepository },
        { provide: EXPORT_REPOSITORY, useValue: exportRepository },
        { provide: STORAGE_PROVIDER, useValue: storageProvider },
      ],
    };
    return { module: FormattingModule, ...metadata };
  }
}
