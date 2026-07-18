import { type DynamicModule, Module } from '@nestjs/common';

import { TOPIC_REPOSITORY, type TopicRepository } from './topic.repository.js';
import { TopicController } from './topic.controller.js';
import { TopicService } from './topic.service.js';

@Module({})
export class TopicModule {
  static register(repository: TopicRepository, identityModule: DynamicModule): DynamicModule {
    return {
      module: TopicModule,
      imports: [identityModule],
      controllers: [TopicController],
      providers: [TopicService, { provide: TOPIC_REPOSITORY, useValue: repository }],
    };
  }
}
