import { type DynamicModule, Module } from '@nestjs/common';

import { ArticleController } from './article.controller.js';
import { ARTICLE_REPOSITORY, type ArticleRepository } from './article.repository.js';
import { ArticleService } from './article.service.js';

@Module({})
export class ArticleModule {
  static register(repository: ArticleRepository, identityModule: DynamicModule): DynamicModule {
    return {
      module: ArticleModule,
      imports: [identityModule],
      controllers: [ArticleController],
      providers: [ArticleService, { provide: ARTICLE_REPOSITORY, useValue: repository }],
      exports: [ArticleService],
    };
  }
}
