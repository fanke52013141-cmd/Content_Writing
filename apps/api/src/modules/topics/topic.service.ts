import type { CreateTopic, LinkTopicProject, Topic, UpdateTopic } from '@content-writing/contracts';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import {
  TOPIC_REPOSITORY,
  type TopicRepository,
  type TopicRepositoryMutation,
} from './topic.repository.js';

@Injectable()
export class TopicService implements OnModuleDestroy {
  constructor(
    @Inject(TOPIC_REPOSITORY) private readonly repository: TopicRepository,
    private readonly identityService: IdentityService,
  ) {}

  private resolveMutation(result: TopicRepositoryMutation): Topic {
    if (result.kind === 'ok') return result.topic;
    if (result.kind === 'not_found') throw new NotFoundException('Topic not found.');
    if (result.kind === 'not_editable') {
      throw new ConflictException('AI topic candidates are immutable; copy one to edit it.');
    }
    throw new BadRequestException('The selected account or project is unavailable or archived.');
  }

  async create(input: CreateTopic): Promise<Topic> {
    const user = await this.identityService.getCurrentUser();
    const topic = await this.repository.create(user.id, input);
    if (!topic) throw new BadRequestException('The selected account is unavailable or archived.');
    return topic;
  }

  async list(): Promise<readonly Topic[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.list(user.id);
  }

  async get(topicId: string): Promise<Topic> {
    const user = await this.identityService.getCurrentUser();
    const topic = await this.repository.get(user.id, topicId);
    if (!topic) throw new NotFoundException('Topic not found.');
    return topic;
  }

  async update(topicId: string, input: UpdateTopic): Promise<Topic> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.update(user.id, topicId, input));
  }

  async linkProject(topicId: string, projectId: string, input: LinkTopicProject): Promise<Topic> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(
      await this.repository.linkProject(user.id, topicId, projectId, input),
    );
  }

  async unlinkProject(topicId: string, projectId: string): Promise<Topic> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.unlinkProject(user.id, topicId, projectId));
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
