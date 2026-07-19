import {
  articleExportSchema,
  articleFormatPreviewSchema,
  articleImageSchema,
  createArticleExportSchema,
  createFormatPreviewSchema,
  type ArticleExport,
  type ArticleFormatPreview,
  type ArticleImage,
} from '@content-writing/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { FormattingService } from './formatting.service.js';

@ApiTags('formatting')
@Controller('articles')
export class FormattingController {
  constructor(private readonly formattingService: FormattingService) {}

  @Get(':articleId/images')
  async listImages(@Param('articleId') articleId: string): Promise<readonly ArticleImage[]> {
    return z
      .array(articleImageSchema)
      .parse(await this.formattingService.listImages(parseRequest(z.uuid(), articleId)));
  }

  @Post(':articleId/images')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one local image for manual WeChat editor insertion' })
  async uploadImage(
    @Param('articleId') articleId: string,
    @Req() request: FastifyRequest,
  ): Promise<ArticleImage> {
    let uploaded: { filename: string; mimeType: string; content: Buffer } | null = null;
    for await (const part of request.parts()) {
      if (part.type !== 'file') continue;
      if (uploaded) throw new BadRequestException('Upload exactly one image.');
      uploaded = {
        filename: part.filename,
        mimeType: part.mimetype,
        content: await part.toBuffer(),
      };
    }
    if (!uploaded) throw new BadRequestException('An image file is required.');
    return articleImageSchema.parse(
      await this.formattingService.uploadImage(parseRequest(z.uuid(), articleId), uploaded),
    );
  }

  @Get(':articleId/images/:imageId/content')
  async readImage(
    @Param('articleId') articleId: string,
    @Param('imageId') imageId: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const image = await this.formattingService.readImage(
      parseRequest(z.uuid(), articleId),
      parseRequest(z.uuid(), imageId),
    );
    reply
      .header('content-type', image.mimeType)
      .header('cache-control', 'private, max-age=3600')
      .send(image.content);
  }

  @Delete(':articleId/images/:imageId')
  async removeImage(
    @Param('articleId') articleId: string,
    @Param('imageId') imageId: string,
  ): Promise<{ ok: true }> {
    await this.formattingService.removeImage(
      parseRequest(z.uuid(), articleId),
      parseRequest(z.uuid(), imageId),
    );
    return { ok: true };
  }

  @Post(':articleId/format-preview')
  @ApiOperation({
    summary: 'Render a deterministic local preview while preserving image placeholders',
  })
  async preview(
    @Param('articleId') articleId: string,
    @Body() body: unknown,
  ): Promise<ArticleFormatPreview> {
    return articleFormatPreviewSchema.parse(
      await this.formattingService.preview(
        parseRequest(z.uuid(), articleId),
        parseRequest(createFormatPreviewSchema, body),
      ),
    );
  }

  @Post(':articleId/exports')
  @ApiOperation({ summary: 'Create a Markdown or HTML export history record' })
  async createExport(
    @Param('articleId') articleId: string,
    @Body() body: unknown,
  ): Promise<ArticleExport> {
    return articleExportSchema.parse(
      await this.formattingService.createExport(
        parseRequest(z.uuid(), articleId),
        parseRequest(createArticleExportSchema, body),
      ),
    );
  }

  @Get(':articleId/exports')
  async listExports(@Param('articleId') articleId: string): Promise<readonly ArticleExport[]> {
    return z
      .array(articleExportSchema)
      .parse(await this.formattingService.listExports(parseRequest(z.uuid(), articleId)));
  }
}
