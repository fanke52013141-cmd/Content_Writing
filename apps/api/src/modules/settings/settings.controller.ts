import {
  activatePromptVersionSchema,
  createModelProviderConfigSchema,
  createPromptSchema,
  createPromptVersionSchema,
  modelProviderConfigSchema,
  promptSchema,
  updateModelProviderConfigSchema,
  type ModelProviderConfig,
  type Prompt,
} from '@content-writing/contracts';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@Controller()
export class SettingsController {
  constructor(private readonly service: SettingsService) {}
  @Get('prompts')
  async listPrompts(): Promise<readonly Prompt[]> {
    return z.array(promptSchema).parse(await this.service.listPrompts());
  }
  @Post('prompts')
  async createPrompt(@Body() body: unknown): Promise<Prompt> {
    return promptSchema.parse(
      await this.service.createPrompt(parseRequest(createPromptSchema, body)),
    );
  }
  @Post('prompts/:promptId/versions')
  async createVersion(@Param('promptId') promptId: string, @Body() body: unknown): Promise<Prompt> {
    return promptSchema.parse(
      await this.service.createPromptVersion(
        parseRequest(z.uuid(), promptId),
        parseRequest(createPromptVersionSchema, body),
      ),
    );
  }
  @Post('prompts/:promptId/versions/:versionId/activate')
  async activate(
    @Param('promptId') promptId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ): Promise<Prompt> {
    return promptSchema.parse(
      await this.service.activatePromptVersion(
        parseRequest(z.uuid(), promptId),
        parseRequest(z.uuid(), versionId),
        parseRequest(activatePromptVersionSchema, body),
      ),
    );
  }
  @Get('model-providers')
  async listProviders(): Promise<readonly ModelProviderConfig[]> {
    return z.array(modelProviderConfigSchema).parse(await this.service.listProviders());
  }
  @Post('model-providers')
  async createProvider(@Body() body: unknown): Promise<ModelProviderConfig> {
    return modelProviderConfigSchema.parse(
      await this.service.createProvider(parseRequest(createModelProviderConfigSchema, body)),
    );
  }
  @Patch('model-providers/:providerId')
  async updateProvider(
    @Param('providerId') providerId: string,
    @Body() body: unknown,
  ): Promise<ModelProviderConfig> {
    return modelProviderConfigSchema.parse(
      await this.service.updateProvider(
        parseRequest(z.uuid(), providerId),
        parseRequest(updateModelProviderConfigSchema, body),
      ),
    );
  }
}
