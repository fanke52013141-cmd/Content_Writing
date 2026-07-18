import {
  localUserSchema,
  setLocalPinSchema,
  updateLocalUserSchema,
  type LocalUser,
} from '@content-writing/contracts';
import { Body, Controller, Get, Patch, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { parseRequest } from '../../common/zod.js';
import { IdentityService } from './identity.service.js';

@ApiTags('identity')
@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the single local user' })
  @ApiOkResponse({ description: 'Public local-user settings without credential material' })
  async getCurrentUser(): Promise<LocalUser> {
    return localUserSchema.parse(await this.identityService.getCurrentUser());
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the local display name' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['displayName'],
      properties: { displayName: { type: 'string', maxLength: 80 } },
    },
  })
  async updateCurrentUser(@Body() body: unknown): Promise<LocalUser> {
    return this.identityService.updateCurrentUser(parseRequest(updateLocalUserSchema, body));
  }

  @Put('settings/pin')
  @ApiOperation({ summary: 'Enable or replace the optional local PIN' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['pin'],
      properties: { pin: { type: 'string', pattern: '^\\d{4,12}$' } },
    },
  })
  async enablePin(@Body() body: unknown): Promise<LocalUser> {
    return this.identityService.enablePin(parseRequest(setLocalPinSchema, body));
  }
}
