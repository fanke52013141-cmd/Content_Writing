import {
  createGenerationSchema,
  generationSchema,
  type Generation,
} from '@content-writing/contracts';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { GenerationService } from './generation.service.js';

@ApiTags('generations')
@Controller('generations')
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue an immutable AI generation trace' })
  @ApiAcceptedResponse({ description: 'Generation and transactional outbox event created' })
  async create(@Body() body: unknown): Promise<Generation> {
    const input = parseRequest(createGenerationSchema, body);
    return generationSchema.parse(await this.generationService.create(input));
  }

  @Get(':generationId')
  @ApiOperation({ summary: 'Read the current generation lifecycle state' })
  async get(@Param('generationId') generationId: string): Promise<Generation> {
    const id = parseRequest(z.uuid(), generationId);
    return generationSchema.parse(await this.generationService.get(id));
  }
}
