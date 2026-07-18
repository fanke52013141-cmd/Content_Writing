import type { CreateGeneration, Generation } from '@content-writing/contracts';
import { Inject, Injectable, NotFoundException, type OnModuleDestroy } from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import { GENERATION_REPOSITORY, type GenerationRepository } from './generation.repository.js';

@Injectable()
export class GenerationService implements OnModuleDestroy {
  constructor(
    @Inject(GENERATION_REPOSITORY) private readonly repository: GenerationRepository,
    private readonly identityService: IdentityService,
  ) {}

  async create(input: CreateGeneration): Promise<Generation> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.create(user.id, input);
  }

  async get(generationId: string): Promise<Generation> {
    const user = await this.identityService.getCurrentUser();
    const generation = await this.repository.get(user.id, generationId);
    if (!generation) throw new NotFoundException('Generation not found.');
    return generation;
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
