import { type DynamicModule, Module } from '@nestjs/common';

import {
  MODEL_PROVIDER_REPOSITORY,
  type ModelProviderRepository,
} from './model-provider.repository.js';
import { ModelCrypto } from './model-crypto.js';
import { PROMPT_REPOSITORY, type PromptRepository } from './prompt.repository.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({})
export class SettingsModule {
  static register(
    promptRepository: PromptRepository,
    providerRepository: ModelProviderRepository,
    identityModule: DynamicModule,
    encryptionKey: string,
  ): DynamicModule {
    return {
      module: SettingsModule,
      imports: [identityModule],
      controllers: [SettingsController],
      providers: [
        SettingsService,
        { provide: ModelCrypto, useValue: new ModelCrypto(encryptionKey) },
        { provide: PROMPT_REPOSITORY, useValue: promptRepository },
        { provide: MODEL_PROVIDER_REPOSITORY, useValue: providerRepository },
      ],
    };
  }
}
