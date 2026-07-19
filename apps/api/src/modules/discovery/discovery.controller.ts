import {
  externalSearchInputSchema,
  externalSearchRunSchema,
  externalSourcePolicySchema,
  hotTopicHistoryQuerySchema,
  hotTopicItemSchema,
  hotTopicQuerySchema,
  hotTopicToTopicSchema,
  topicSchema,
  updateExternalSourcePolicySchema,
  type ExternalSearchRun,
  type ExternalSourcePolicy,
  type HotTopicItem,
  type Topic,
} from '@content-writing/contracts';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { DiscoveryService } from './discovery.service.js';

@ApiTags('discovery')
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('sources')
  @ApiOperation({ summary: 'List per-source terms review and enablement policies' })
  async listPolicies(): Promise<readonly ExternalSourcePolicy[]> {
    return z.array(externalSourcePolicySchema).parse(await this.discoveryService.listPolicies());
  }

  @Patch('sources/:policyId')
  @ApiOperation({ summary: 'Review and explicitly enable or restrict one external source' })
  async updatePolicy(
    @Param('policyId') policyId: string,
    @Body() body: unknown,
  ): Promise<ExternalSourcePolicy> {
    return externalSourcePolicySchema.parse(
      await this.discoveryService.updatePolicy(
        parseRequest(z.uuid(), policyId),
        parseRequest(updateExternalSourcePolicySchema, body),
      ),
    );
  }

  @Get('hot-topics')
  @ApiOperation({ summary: 'Refresh one approved hot-topic source' })
  async refreshHotTopics(@Query() query: unknown): Promise<readonly HotTopicItem[]> {
    const parsed = parseRequest(hotTopicQuerySchema, query);
    return z
      .array(hotTopicItemSchema)
      .parse(await this.discoveryService.refreshHotTopics(parsed.source, parsed.limit));
  }

  @Get('hot-topics/history')
  @ApiOperation({ summary: 'Read locally stored hot-topic history without network access' })
  async listHotTopicHistory(@Query() query: unknown): Promise<readonly HotTopicItem[]> {
    const parsed = parseRequest(hotTopicHistoryQuerySchema, query);
    return z
      .array(hotTopicItemSchema)
      .parse(await this.discoveryService.listHotTopicHistory(parsed.source, parsed.limit));
  }

  @Post('hot-topics/:itemId/topics')
  @ApiOperation({ summary: 'Convert an approved hot-topic item into a traceable topic' })
  async createTopic(@Param('itemId') itemId: string, @Body() body: unknown): Promise<Topic> {
    return topicSchema.parse(
      await this.discoveryService.createTopic(
        parseRequest(z.uuid(), itemId),
        parseRequest(hotTopicToTopicSchema, body),
      ),
    );
  }

  @Post('search')
  @ApiOperation({ summary: 'Run an approved external search through SearXNG' })
  async search(@Body() body: unknown): Promise<ExternalSearchRun> {
    return externalSearchRunSchema.parse(
      await this.discoveryService.search(parseRequest(externalSearchInputSchema, body)),
    );
  }

  @Get('search/history')
  @ApiOperation({ summary: 'List locally stored external search runs' })
  async listSearchRuns(@Query('limit') limit: unknown): Promise<readonly ExternalSearchRun[]> {
    const parsedLimit = parseRequest(z.coerce.number().int().min(1).max(50).default(20), limit);
    return z
      .array(externalSearchRunSchema)
      .parse(await this.discoveryService.listSearchRuns(parsedLimit));
  }
}
