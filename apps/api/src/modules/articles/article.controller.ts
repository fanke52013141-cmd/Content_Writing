import {
  articleSchema,
  createArticleCandidateSchema,
  createArticleSchema,
  createReviewSchema,
  updateArticleSchema,
  type Article,
  deletionAuditSchema,
  deletionModeSchema,
} from '@content-writing/contracts';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { ArticleService } from './article.service.js';

@ApiTags('articles')
@Controller('articles')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  @Post()
  @ApiOperation({ summary: 'Create an article with an immutable manual Current version' })
  async create(@Body() body: unknown): Promise<Article> {
    return articleSchema.parse(
      await this.articleService.create(parseRequest(createArticleSchema, body)),
    );
  }

  @Get()
  async list(): Promise<readonly Article[]> {
    return z.array(articleSchema).parse(await this.articleService.list());
  }

  @Get(':articleId')
  async get(@Param('articleId') articleId: string): Promise<Article> {
    return articleSchema.parse(await this.articleService.get(parseRequest(z.uuid(), articleId)));
  }

  @Post(':articleId/candidates')
  @ApiOperation({ summary: 'Create an immutable AI or revision candidate' })
  async createCandidate(
    @Param('articleId') articleId: string,
    @Body() body: unknown,
  ): Promise<Article> {
    return articleSchema.parse(
      await this.articleService.createCandidate(
        parseRequest(z.uuid(), articleId),
        parseRequest(createArticleCandidateSchema, body),
      ),
    );
  }

  @Post(':articleId/versions/:versionId/accept')
  @ApiOperation({ summary: 'Explicitly accept a candidate as Current' })
  async acceptCandidate(
    @Param('articleId') articleId: string,
    @Param('versionId') versionId: string,
  ): Promise<Article> {
    return articleSchema.parse(
      await this.articleService.acceptCandidate(
        parseRequest(z.uuid(), articleId),
        parseRequest(z.uuid(), versionId),
      ),
    );
  }

  @Post(':articleId/reviews')
  @ApiOperation({ summary: 'Attach a positioning, fact-risk or readability review' })
  async createReview(
    @Param('articleId') articleId: string,
    @Body() body: unknown,
  ): Promise<Article> {
    return articleSchema.parse(
      await this.articleService.createReview(
        parseRequest(z.uuid(), articleId),
        parseRequest(createReviewSchema, body),
      ),
    );
  }

  @Patch(':articleId')
  @ApiOperation({ summary: 'Archive or restore an article' })
  async update(@Param('articleId') articleId: string, @Body() body: unknown): Promise<Article> {
    return articleSchema.parse(
      await this.articleService.update(
        parseRequest(z.uuid(), articleId),
        parseRequest(updateArticleSchema, body),
      ),
    );
  }

  @Delete(':articleId')
  @ApiOperation({ summary: 'Archive, soft-delete or permanently delete an article' })
  async delete(@Param('articleId') articleId: string, @Query('mode') mode: unknown) {
    const parsedMode = parseRequest(deletionModeSchema, mode ?? 'soft');
    return deletionAuditSchema.parse(
      await this.articleService.delete(parseRequest(z.uuid(), articleId), parsedMode),
    );
  }
}
