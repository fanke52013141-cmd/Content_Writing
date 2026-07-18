import type { CreateOutline, Outline, UpdateOutline } from '@content-writing/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import {
  OUTLINE_REPOSITORY,
  type OutlineRepository,
  type OutlineRepositoryMutation,
} from './outline.repository.js';

@Injectable()
export class OutlineService implements OnModuleDestroy {
  constructor(
    @Inject(OUTLINE_REPOSITORY) private readonly repository: OutlineRepository,
    private readonly identityService: IdentityService,
  ) {}

  private resolveMutation(result: OutlineRepositoryMutation): Outline {
    if (result.kind === 'ok') return result.outline;
    if (result.kind === 'not_found') throw new NotFoundException('Outline not found.');
    throw new BadRequestException('The selected project or topic is unavailable.');
  }

  async create(input: CreateOutline): Promise<Outline> {
    const user = await this.identityService.getCurrentUser();
    const outline = await this.repository.create(user.id, input);
    if (!outline) throw new BadRequestException('The selected project or topic is unavailable.');
    return outline;
  }

  async list(): Promise<readonly Outline[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.list(user.id);
  }

  async get(outlineId: string): Promise<Outline> {
    const user = await this.identityService.getCurrentUser();
    const outline = await this.repository.get(user.id, outlineId);
    if (!outline) throw new NotFoundException('Outline not found.');
    return outline;
  }

  async update(outlineId: string, input: UpdateOutline): Promise<Outline> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.update(user.id, outlineId, input));
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
