import {
  createOutlineSchema,
  outlineSchema,
  updateOutlineSchema,
  type Outline,
} from '@content-writing/contracts';
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { OutlineService } from './outline.service.js';

@ApiTags('outlines')
@Controller('outlines')
export class OutlineController {
  constructor(private readonly outlineService: OutlineService) {}

  @Post()
  @ApiOperation({ summary: 'Create a structured article outline' })
  async create(@Body() body: unknown): Promise<Outline> {
    return outlineSchema.parse(
      await this.outlineService.create(parseRequest(createOutlineSchema, body)),
    );
  }

  @Get()
  async list(): Promise<readonly Outline[]> {
    return z.array(outlineSchema).parse(await this.outlineService.list());
  }

  @Get(':outlineId')
  async get(@Param('outlineId') outlineId: string): Promise<Outline> {
    return outlineSchema.parse(await this.outlineService.get(parseRequest(z.uuid(), outlineId)));
  }

  @Patch(':outlineId')
  @ApiOperation({ summary: 'Edit, archive or restore an outline' })
  async update(@Param('outlineId') outlineId: string, @Body() body: unknown): Promise<Outline> {
    return outlineSchema.parse(
      await this.outlineService.update(
        parseRequest(z.uuid(), outlineId),
        parseRequest(updateOutlineSchema, body),
      ),
    );
  }
}
