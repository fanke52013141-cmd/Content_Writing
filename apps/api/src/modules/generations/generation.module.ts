import { type DynamicModule, Module } from '@nestjs/common';

import { GenerationController } from './generation.controller.js';
import { GENERATION_REPOSITORY, type GenerationRepository } from './generation.repository.js';
import { GenerationService } from './generation.service.js';

@Module({})
export class GenerationModule {
  static register(repository: GenerationRepository, identityModule: DynamicModule): DynamicModule {
    return {
      module: GenerationModule,
      imports: [identityModule],
      controllers: [GenerationController],
      providers: [GenerationService, { provide: GENERATION_REPOSITORY, useValue: repository }],
    };
  }
}
