import { type DynamicModule, Module } from '@nestjs/common';

import { HealthController } from './modules/health/health.controller.js';
import { AccountModule } from './modules/accounts/account.module.js';
import type { AccountRepository } from './modules/accounts/account.repository.js';
import { ArticleModule } from './modules/articles/article.module.js';
import type { ArticleRepository } from './modules/articles/article.repository.js';
import { GenerationModule } from './modules/generations/generation.module.js';
import type { GenerationRepository } from './modules/generations/generation.repository.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import type { LocalUserRepository } from './modules/identity/local-user.repository.js';
import { MaterialModule } from './modules/materials/material.module.js';
import type {
  DocumentExtractor,
  WebpageExtractor,
} from './modules/materials/material-extractor.js';
import type { MaterialRepository } from './modules/materials/material.repository.js';
import type { StorageProvider } from './modules/materials/storage.provider.js';
import { OutlineModule } from './modules/outlines/outline.module.js';
import type { OutlineRepository } from './modules/outlines/outline.repository.js';
import { ProjectModule } from './modules/projects/project.module.js';
import type { ProjectRepository } from './modules/projects/project.repository.js';
import { TopicModule } from './modules/topics/topic.module.js';
import type { TopicRepository } from './modules/topics/topic.repository.js';
import { DiscoveryModule } from './modules/discovery/discovery.module.js';
import type { DiscoveryRepository } from './modules/discovery/discovery.repository.js';
import type { ExternalSearchProvider, HotTopicProvider } from '@content-writing/contracts';
import { FormattingModule } from './modules/formatting/formatting.module.js';
import type { ImageAssetRepository } from './modules/formatting/image.repository.js';
import type { ArticleExportRepository } from './modules/formatting/export.repository.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import type { PromptRepository } from './modules/settings/prompt.repository.js';
import type { ModelProviderRepository } from './modules/settings/model-provider.repository.js';
import { DeletionModule } from './modules/deletions/deletion.module.js';
import type { DeletionRepository } from './modules/deletions/deletion.repository.js';

@Module({})
export class AppModule {
  static register(
    localUserRepository: LocalUserRepository,
    generationRepository: GenerationRepository,
    accountRepository: AccountRepository,
    projectRepository: ProjectRepository,
    topicRepository: TopicRepository,
    materialRepository: MaterialRepository,
    outlineRepository: OutlineRepository,
    articleRepository: ArticleRepository,
    storageProvider: StorageProvider,
    documentExtractor: DocumentExtractor,
    webpageExtractor: WebpageExtractor,
    discoveryRepository: DiscoveryRepository,
    hotTopicProvider: HotTopicProvider,
    searchProvider: ExternalSearchProvider,
    imageRepository: ImageAssetRepository,
    exportRepository: ArticleExportRepository,
    promptRepository: PromptRepository,
    modelProviderRepository: ModelProviderRepository,
    deletionRepository: DeletionRepository,
    modelEncryptionKey: string,
  ): DynamicModule {
    const identityModule = IdentityModule.register(localUserRepository);
    return {
      module: AppModule,
      imports: [
        AccountModule.register(accountRepository, identityModule),
        ArticleModule.register(articleRepository, identityModule, storageProvider),
        GenerationModule.register(generationRepository, identityModule),
        MaterialModule.register(
          materialRepository,
          storageProvider,
          documentExtractor,
          webpageExtractor,
          identityModule,
        ),
        ProjectModule.register(projectRepository, identityModule),
        TopicModule.register(topicRepository, identityModule),
        OutlineModule.register(outlineRepository, identityModule),
        DiscoveryModule.register(
          discoveryRepository,
          hotTopicProvider,
          searchProvider,
          topicRepository,
          identityModule,
        ),
        FormattingModule.register(
          articleRepository,
          imageRepository,
          exportRepository,
          storageProvider,
          identityModule,
        ),
        SettingsModule.register(
          promptRepository,
          modelProviderRepository,
          identityModule,
          modelEncryptionKey,
        ),
        DeletionModule.register(deletionRepository, identityModule, storageProvider),
      ],
      controllers: [HealthController],
    };
  }
}
