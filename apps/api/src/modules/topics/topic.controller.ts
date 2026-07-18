import {
  createTopicSchema,
  linkTopicProjectSchema,
  topicSchema,
  updateTopicSchema,
  type Topic,
} from '@content-writing/contracts';
import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { TopicService } from './topic.service.js';

@ApiTags('topics')
@Controller('topics')
export class TopicController {
  constructor(private readonly topicService: TopicService) {}

  @Post()
  @ApiOperation({ summary: 'Create a reusable topic independently from any project' })
  async create(@Body() body: unknown): Promise<Topic> {
    return topicSchema.parse(await this.topicService.create(parseRequest(createTopicSchema, body)));
  }

  @Get()
  async list(): Promise<readonly Topic[]> {
    return z.array(topicSchema).parse(await this.topicService.list());
  }

  @Get(':topicId')
  async get(@Param('topicId') topicId: string): Promise<Topic> {
    return topicSchema.parse(await this.topicService.get(parseRequest(z.uuid(), topicId)));
  }

  @Patch(':topicId')
  @ApiOperation({ summary: 'Edit, archive or restore a manual topic' })
  async update(@Param('topicId') topicId: string, @Body() body: unknown): Promise<Topic> {
    return topicSchema.parse(
      await this.topicService.update(
        parseRequest(z.uuid(), topicId),
        parseRequest(updateTopicSchema, body),
      ),
    );
  }

  @Put(':topicId/projects/:projectId')
  @ApiOperation({ summary: 'Link a topic and optionally set it as the project primary topic' })
  async linkProject(
    @Param('topicId') topicId: string,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<Topic> {
    return topicSchema.parse(
      await this.topicService.linkProject(
        parseRequest(z.uuid(), topicId),
        parseRequest(z.uuid(), projectId),
        parseRequest(linkTopicProjectSchema, body),
      ),
    );
  }

  @Delete(':topicId/projects/:projectId')
  @ApiOperation({ summary: 'End the project relation without deleting the reusable topic' })
  async unlinkProject(
    @Param('topicId') topicId: string,
    @Param('projectId') projectId: string,
  ): Promise<Topic> {
    return topicSchema.parse(
      await this.topicService.unlinkProject(
        parseRequest(z.uuid(), topicId),
        parseRequest(z.uuid(), projectId),
      ),
    );
  }
}
