import { type DynamicModule, Module } from '@nestjs/common';

import { HealthController } from './modules/health/health.controller.js';
import { AccountModule } from './modules/accounts/account.module.js';
import type { AccountRepository } from './modules/accounts/account.repository.js';
import { GenerationModule } from './modules/generations/generation.module.js';
import type { GenerationRepository } from './modules/generations/generation.repository.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import type { LocalUserRepository } from './modules/identity/local-user.repository.js';
import { ProjectModule } from './modules/projects/project.module.js';
import type { ProjectRepository } from './modules/projects/project.repository.js';

@Module({})
export class AppModule {
  static register(
    localUserRepository: LocalUserRepository,
    generationRepository: GenerationRepository,
    accountRepository: AccountRepository,
    projectRepository: ProjectRepository,
  ): DynamicModule {
    const identityModule = IdentityModule.register(localUserRepository);
    return {
      module: AppModule,
      imports: [
        AccountModule.register(accountRepository, identityModule),
        GenerationModule.register(generationRepository, identityModule),
        ProjectModule.register(projectRepository, identityModule),
      ],
      controllers: [HealthController],
    };
  }
}
