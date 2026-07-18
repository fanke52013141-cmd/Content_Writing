import { DynamicModule, Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module.js';
import { OutlineController } from './outline.controller.js';
import { OutlineService } from './outline.service.js';
import { OUTLINE_REPOSITORY, type OutlineRepository } from './outline.repository.js';

@Module({
  imports: [IdentityModule],
  controllers: [OutlineController],
  providers: [OutlineService],
  exports: [OutlineService],
})
export class OutlineModule {
  static register(repository: OutlineRepository, identityModule: DynamicModule): DynamicModule {
    return {
      module: OutlineModule,
      imports: [identityModule],
      controllers: [OutlineController],
      providers: [OutlineService, { provide: OUTLINE_REPOSITORY, useValue: repository }],
      exports: [OutlineService],
    };
  }
}
