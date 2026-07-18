import {
  contentProjectSchema,
  createContentProjectSchema,
  linkProjectAccountSchema,
  updateContentProjectSchema,
  type ContentProject,
} from '@content-writing/contracts';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { ProjectService } from './project.service.js';

@ApiTags('projects')
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @ApiOperation({ summary: 'Create a flexible content project with an explicit origin' })
  async create(@Body() body: unknown): Promise<ContentProject> {
    return contentProjectSchema.parse(
      await this.projectService.create(parseRequest(createContentProjectSchema, body)),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List content projects without forcing workflow steps' })
  async list(): Promise<readonly ContentProject[]> {
    return z.array(contentProjectSchema).parse(await this.projectService.list());
  }

  @Get(':projectId')
  async get(@Param('projectId') projectId: string): Promise<ContentProject> {
    return contentProjectSchema.parse(
      await this.projectService.get(parseRequest(z.uuid(), projectId)),
    );
  }

  @Patch(':projectId')
  @ApiOperation({ summary: 'Edit, complete, archive or reopen a content project' })
  async update(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<ContentProject> {
    return contentProjectSchema.parse(
      await this.projectService.update(
        parseRequest(z.uuid(), projectId),
        parseRequest(updateContentProjectSchema, body),
      ),
    );
  }

  @Put(':projectId/accounts')
  @ApiOperation({ summary: 'Link an account and optionally make it the single primary account' })
  async linkAccount(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<ContentProject> {
    return contentProjectSchema.parse(
      await this.projectService.linkAccount(
        parseRequest(z.uuid(), projectId),
        parseRequest(linkProjectAccountSchema, body),
      ),
    );
  }

  @Delete(':projectId/accounts/:accountId')
  @ApiOperation({ summary: 'Unlink an account without deleting the reusable account' })
  async unlinkAccount(
    @Param('projectId') projectId: string,
    @Param('accountId') accountId: string,
  ): Promise<ContentProject> {
    return contentProjectSchema.parse(
      await this.projectService.unlinkAccount(
        parseRequest(z.uuid(), projectId),
        parseRequest(z.uuid(), accountId),
      ),
    );
  }
}
