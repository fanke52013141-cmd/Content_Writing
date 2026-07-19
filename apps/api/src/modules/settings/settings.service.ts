import type {
  ActivatePromptVersion,
  CreateModelProviderConfig,
  CreatePrompt,
  CreatePromptVersion,
  ModelProviderConfig,
  Prompt,
  UpdateModelProviderConfig,
} from '@content-writing/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import {
  MODEL_PROVIDER_REPOSITORY,
  type ModelProviderRepository,
} from './model-provider.repository.js';
import { ModelCrypto } from './model-crypto.js';
import { PROMPT_REPOSITORY, type PromptRepository } from './prompt.repository.js';

@Injectable()
export class SettingsService implements OnModuleDestroy {
  constructor(
    private readonly identityService: IdentityService,
    @Inject(PROMPT_REPOSITORY) private readonly prompts: PromptRepository,
    @Inject(MODEL_PROVIDER_REPOSITORY) private readonly providers: ModelProviderRepository,
    private readonly crypto: ModelCrypto,
  ) {}
  private async ownerId(): Promise<string> {
    return (await this.identityService.getCurrentUser()).id;
  }
  listPrompts(): Promise<readonly Prompt[]> {
    return this.ownerId().then((id) => this.prompts.list(id));
  }
  async createPrompt(input: CreatePrompt): Promise<Prompt> {
    if (input.safetyBoundary)
      throw new BadRequestException('Safety boundary prompts are maintained by the system.');
    const result = await this.prompts.create(await this.ownerId(), {
      ...input,
      safetyBoundary: false,
    });
    if (!result) throw new BadRequestException('The selected AI capability is unavailable.');
    return result;
  }
  async createPromptVersion(promptId: string, input: CreatePromptVersion): Promise<Prompt> {
    const result = await this.prompts.createVersion(await this.ownerId(), promptId, input);
    if (!result) throw new NotFoundException('Prompt not found.');
    return result;
  }
  async activatePromptVersion(
    promptId: string,
    versionId: string,
    input: ActivatePromptVersion,
  ): Promise<Prompt> {
    const result = await this.prompts.activate(await this.ownerId(), promptId, versionId, input);
    if (!result) throw new NotFoundException('Prompt or version not found.');
    return result;
  }
  listProviders(): Promise<readonly ModelProviderConfig[]> {
    return this.ownerId().then((id) => this.providers.list(id));
  }
  async createProvider(input: CreateModelProviderConfig): Promise<ModelProviderConfig> {
    const ciphertext = input.apiKey ? this.crypto.encrypt(input.apiKey) : null;
    return this.providers.create(await this.ownerId(), input, ciphertext);
  }
  async updateProvider(id: string, input: UpdateModelProviderConfig): Promise<ModelProviderConfig> {
    const key = Object.prototype.hasOwnProperty.call(input, 'apiKey')
      ? input.apiKey
        ? this.crypto.encrypt(input.apiKey)
        : null
      : undefined;
    const result = await this.providers.update(await this.ownerId(), id, input, key);
    if (!result) throw new NotFoundException('Model provider not found.');
    return result;
  }
  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.prompts.close?.(), this.providers.close?.()]);
  }
}
