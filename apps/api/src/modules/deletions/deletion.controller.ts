import {
  deletableObjectTypeSchema,
  deletionAuditSchema,
  deletionModeSchema,
  type DeletionAudit,
} from '@content-writing/contracts';
import { Controller, Delete, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { DeletionService } from './deletion.service.js';

@ApiTags('deletions')
@Controller('deletions')
export class DeletionController {
  constructor(private readonly deletionService: DeletionService) {}

  @Delete(':objectType/:objectId')
  @ApiOperation({
    summary: 'Archive, hide or permanently remove a content object with an audit-only record',
  })
  async delete(
    @Param('objectType') objectType: string,
    @Param('objectId') objectId: string,
    @Query('mode') mode: string | undefined,
  ): Promise<DeletionAudit> {
    return deletionAuditSchema.parse(
      await this.deletionService.delete(
        parseRequest(deletableObjectTypeSchema, objectType),
        parseRequest(z.uuid(), objectId),
        parseRequest(deletionModeSchema, mode ?? 'soft'),
      ),
    );
  }
}
