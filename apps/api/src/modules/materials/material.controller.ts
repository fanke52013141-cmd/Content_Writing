import {
  createTextMaterialSchema,
  createUrlMaterialSchema,
  materialSchema,
  updateMaterialSchema,
  type Material,
} from '@content-writing/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { MaterialService } from './material.service.js';

@ApiTags('materials')
@Controller('materials')
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  @Post('text')
  @ApiOperation({ summary: 'Create a plain-text or Markdown material' })
  async createText(@Body() body: unknown): Promise<Material> {
    return materialSchema.parse(
      await this.materialService.createText(parseRequest(createTextMaterialSchema, body)),
    );
  }

  @Post('url')
  @ApiOperation({ summary: 'Fetch an HTTP(S) page and preserve a 14-day raw snapshot' })
  async createUrl(@Body() body: unknown): Promise<Material> {
    return materialSchema.parse(
      await this.materialService.createUrl(parseRequest(createUrlMaterialSchema, body)),
    );
  }

  @Post('file')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import TXT, Markdown, DOCX or a text-extractable PDF' })
  async createFile(@Req() request: FastifyRequest): Promise<Material> {
    const fields: Record<string, string> = {};
    let uploaded: { filename: string; mimeType: string; content: Buffer } | null = null;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (uploaded) throw new BadRequestException('Upload exactly one material file.');
        uploaded = {
          filename: part.filename,
          mimeType: part.mimetype,
          content: await part.toBuffer(),
        };
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }
    if (!uploaded) throw new BadRequestException('A material file is required.');
    return materialSchema.parse(
      await this.materialService.createFile({
        ...uploaded,
        ...(fields.title ? { title: fields.title } : {}),
        ...(fields.notes ? { notes: fields.notes } : {}),
      }),
    );
  }

  @Get()
  async list(): Promise<readonly Material[]> {
    return z.array(materialSchema).parse(await this.materialService.list());
  }

  @Get(':materialId')
  async get(@Param('materialId') materialId: string): Promise<Material> {
    return materialSchema.parse(await this.materialService.get(parseRequest(z.uuid(), materialId)));
  }

  @Patch(':materialId')
  async update(@Param('materialId') materialId: string, @Body() body: unknown): Promise<Material> {
    return materialSchema.parse(
      await this.materialService.update(
        parseRequest(z.uuid(), materialId),
        parseRequest(updateMaterialSchema, body),
      ),
    );
  }

  @Put(':materialId/projects/:projectId')
  async linkProject(
    @Param('materialId') materialId: string,
    @Param('projectId') projectId: string,
  ): Promise<Material> {
    return materialSchema.parse(
      await this.materialService.linkProject(
        parseRequest(z.uuid(), materialId),
        parseRequest(z.uuid(), projectId),
      ),
    );
  }

  @Delete(':materialId/projects/:projectId')
  async unlinkProject(
    @Param('materialId') materialId: string,
    @Param('projectId') projectId: string,
  ): Promise<Material> {
    return materialSchema.parse(
      await this.materialService.unlinkProject(
        parseRequest(z.uuid(), materialId),
        parseRequest(z.uuid(), projectId),
      ),
    );
  }

  @Put(':materialId/topics/:topicId')
  async linkTopic(
    @Param('materialId') materialId: string,
    @Param('topicId') topicId: string,
  ): Promise<Material> {
    return materialSchema.parse(
      await this.materialService.linkTopic(
        parseRequest(z.uuid(), materialId),
        parseRequest(z.uuid(), topicId),
      ),
    );
  }

  @Delete(':materialId/topics/:topicId')
  async unlinkTopic(
    @Param('materialId') materialId: string,
    @Param('topicId') topicId: string,
  ): Promise<Material> {
    return materialSchema.parse(
      await this.materialService.unlinkTopic(
        parseRequest(z.uuid(), materialId),
        parseRequest(z.uuid(), topicId),
      ),
    );
  }
}
