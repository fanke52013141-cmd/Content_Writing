import { type DynamicModule, Module } from '@nestjs/common';

import { ProjectController } from './project.controller.js';
import { PROJECT_REPOSITORY, type ProjectRepository } from './project.repository.js';
import { ProjectService } from './project.service.js';

@Module({})
export class ProjectModule {
  static register(repository: ProjectRepository, identityModule: DynamicModule): DynamicModule {
    return {
      module: ProjectModule,
      imports: [identityModule],
      controllers: [ProjectController],
      providers: [ProjectService, { provide: PROJECT_REPOSITORY, useValue: repository }],
    };
  }
}
