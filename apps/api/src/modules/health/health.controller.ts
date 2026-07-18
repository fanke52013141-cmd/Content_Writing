import { Controller, Get, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';

import { loadEnvironment } from '../../config/environment.js';

interface HealthResponse {
  service: 'content-writing-api';
  status: 'ok';
  version: string;
  timestamp: string;
  traceId: string;
}

@ApiTags('system')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check whether the API process is ready' })
  @ApiOkResponse({ description: 'The API is ready' })
  health(@Req() request: FastifyRequest): HealthResponse {
    return {
      service: 'content-writing-api',
      status: 'ok',
      version: loadEnvironment().version,
      timestamp: new Date().toISOString(),
      traceId: request.id,
    };
  }
}
