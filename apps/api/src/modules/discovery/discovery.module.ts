import type { ExternalSearchProvider, HotTopicProvider } from '@content-writing/contracts';
import { type DynamicModule, Module } from '@nestjs/common';

import { TOPIC_REPOSITORY, type TopicRepository } from '../topics/topic.repository.js';
import { DiscoveryController } from './discovery.controller.js';
import { DISCOVERY_REPOSITORY, type DiscoveryRepository } from './discovery.repository.js';
import {
  DiscoveryService,
  EXTERNAL_SEARCH_PROVIDER,
  HOT_TOPIC_PROVIDER,
} from './discovery.service.js';

@Module({})
export class DiscoveryModule {
  static register(
    repository: DiscoveryRepository,
    hotTopicProvider: HotTopicProvider,
    searchProvider: ExternalSearchProvider,
    topicRepository: TopicRepository,
    identityModule: DynamicModule,
  ): DynamicModule {
    return {
      module: DiscoveryModule,
      imports: [identityModule],
      controllers: [DiscoveryController],
      providers: [
        DiscoveryService,
        { provide: DISCOVERY_REPOSITORY, useValue: repository },
        { provide: HOT_TOPIC_PROVIDER, useValue: hotTopicProvider },
        { provide: EXTERNAL_SEARCH_PROVIDER, useValue: searchProvider },
        { provide: TOPIC_REPOSITORY, useValue: topicRepository },
      ],
    };
  }
}
