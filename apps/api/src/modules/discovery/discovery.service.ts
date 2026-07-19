import type {
  ExternalSearchInput,
  ExternalSearchProvider,
  ExternalSearchRun,
  ExternalSourcePolicy,
  HotTopicItem,
  HotTopicProvider,
  HotTopicSource,
  HotTopicToTopic,
  Topic,
  UpdateExternalSourcePolicy,
} from '@content-writing/contracts';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import { TOPIC_REPOSITORY, type TopicRepository } from '../topics/topic.repository.js';
import { DISCOVERY_REPOSITORY, type DiscoveryRepository } from './discovery.repository.js';

export const HOT_TOPIC_PROVIDER = Symbol('HOT_TOPIC_PROVIDER');
export const EXTERNAL_SEARCH_PROVIDER = Symbol('EXTERNAL_SEARCH_PROVIDER');

@Injectable()
export class DiscoveryService implements OnModuleDestroy {
  constructor(
    @Inject(DISCOVERY_REPOSITORY) private readonly repository: DiscoveryRepository,
    @Inject(HOT_TOPIC_PROVIDER) private readonly hotTopicProvider: HotTopicProvider,
    @Inject(EXTERNAL_SEARCH_PROVIDER) private readonly searchProvider: ExternalSearchProvider,
    @Inject(TOPIC_REPOSITORY) private readonly topicRepository: TopicRepository,
    private readonly identityService: IdentityService,
  ) {}

  private assertEnabled(policy: ExternalSourcePolicy): void {
    if (policy.termsReviewStatus !== 'approved' || !policy.enabled) {
      throw new ForbiddenException(
        'This source is disabled until its terms are reviewed and explicitly approved.',
      );
    }
  }

  async listPolicies(): Promise<readonly ExternalSourcePolicy[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.listPolicies(user.id);
  }

  async updatePolicy(
    policyId: string,
    input: UpdateExternalSourcePolicy,
  ): Promise<ExternalSourcePolicy> {
    const user = await this.identityService.getCurrentUser();
    const policies = await this.repository.listPolicies(user.id);
    const current = policies.find((policy) => policy.id === policyId);
    if (!current) throw new NotFoundException('External source policy not found.');
    const nextStatus = input.termsReviewStatus ?? current.termsReviewStatus;
    const nextEnabled = input.enabled ?? current.enabled;
    if (nextEnabled && nextStatus !== 'approved') {
      throw new BadRequestException('Only an approved source can be enabled.');
    }
    const normalizedInput: UpdateExternalSourcePolicy = {
      ...input,
      ...(nextStatus === 'approved' ? {} : { enabled: false }),
    };
    const updated = await this.repository.updatePolicy(user.id, policyId, normalizedInput);
    if (!updated) throw new NotFoundException('External source policy not found.');
    return updated;
  }

  async refreshHotTopics(source: HotTopicSource, limit: number): Promise<readonly HotTopicItem[]> {
    const user = await this.identityService.getCurrentUser();
    const policy = await this.repository.getPolicy(user.id, 'hot_topic', source);
    if (!policy) throw new NotFoundException('Hot-topic source policy not found.');
    this.assertEnabled(policy);
    try {
      const items = await this.hotTopicProvider.list(source, limit);
      return this.repository.saveHotTopics(user.id, this.hotTopicProvider.key, items);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Hot-topic provider is unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async listHotTopicHistory(
    source: HotTopicSource | undefined,
    limit: number,
  ): Promise<readonly HotTopicItem[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.listHotTopics(user.id, source, limit);
  }

  async createTopic(itemId: string, input: HotTopicToTopic): Promise<Topic> {
    const user = await this.identityService.getCurrentUser();
    const item = await this.repository.getHotTopic(user.id, itemId);
    if (!item) throw new NotFoundException('Hot-topic item not found.');
    const policy = await this.repository.getPolicy(user.id, 'hot_topic', item.source);
    if (!policy) throw new NotFoundException('Hot-topic source policy not found.');
    this.assertEnabled(policy);
    const topic = await this.topicRepository.createFromHotTopic(
      user.id,
      item.id,
      item.title,
      input,
    );
    if (!topic)
      throw new BadRequestException('The selected account or source item is unavailable.');
    return topic;
  }

  async search(input: ExternalSearchInput): Promise<ExternalSearchRun> {
    const user = await this.identityService.getCurrentUser();
    const policy = await this.repository.getPolicy(user.id, 'search', 'searxng');
    if (!policy) throw new NotFoundException('Search source policy not found.');
    this.assertEnabled(policy);
    try {
      const items = await this.searchProvider.search(input.query, input.limit);
      return this.repository.createSearchRun(user.id, input.query, this.searchProvider.key, items);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Search provider is unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async listSearchRuns(limit: number): Promise<readonly ExternalSearchRun[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.listSearchRuns(user.id, limit);
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
