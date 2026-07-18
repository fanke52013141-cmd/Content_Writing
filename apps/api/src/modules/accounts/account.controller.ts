import {
  accountProfileVersionSchema,
  accountSchema,
  createAccountProfileDraftSchema,
  createAccountSchema,
  updateAccountSchema,
  type Account,
  type AccountProfileVersion,
} from '@content-writing/contracts';
import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { parseRequest } from '../../common/zod.js';
import { AccountService } from './account.service.js';

@ApiTags('accounts')
@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  @ApiOperation({ summary: 'Create an independently managed content account' })
  async create(@Body() body: unknown): Promise<Account> {
    return accountSchema.parse(
      await this.accountService.create(parseRequest(createAccountSchema, body)),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all local content accounts' })
  async list(): Promise<readonly Account[]> {
    return z.array(accountSchema).parse(await this.accountService.list());
  }

  @Get(':accountId')
  @ApiOperation({ summary: 'Get one content account' })
  async get(@Param('accountId') accountId: string): Promise<Account> {
    return accountSchema.parse(await this.accountService.get(parseRequest(z.uuid(), accountId)));
  }

  @Patch(':accountId')
  @ApiOperation({ summary: 'Edit, deactivate, archive or restore an account' })
  async update(@Param('accountId') accountId: string, @Body() body: unknown): Promise<Account> {
    return accountSchema.parse(
      await this.accountService.update(
        parseRequest(z.uuid(), accountId),
        parseRequest(updateAccountSchema, body),
      ),
    );
  }

  @Post(':accountId/profile-versions')
  @ApiOperation({ summary: 'Create a new editable manual profile draft' })
  async createProfileDraft(
    @Param('accountId') accountId: string,
    @Body() body: unknown,
  ): Promise<AccountProfileVersion> {
    return accountProfileVersionSchema.parse(
      await this.accountService.createProfileDraft(
        parseRequest(z.uuid(), accountId),
        parseRequest(createAccountProfileDraftSchema, body),
      ),
    );
  }

  @Get(':accountId/profile-versions')
  @ApiOperation({ summary: 'List immutable and draft account profile versions' })
  async listProfiles(
    @Param('accountId') accountId: string,
  ): Promise<readonly AccountProfileVersion[]> {
    return z
      .array(accountProfileVersionSchema)
      .parse(await this.accountService.listProfiles(parseRequest(z.uuid(), accountId)));
  }

  @Put(':accountId/profile-versions/:profileId')
  @ApiOperation({ summary: 'Replace the content of an editable manual profile draft' })
  async updateProfileDraft(
    @Param('accountId') accountId: string,
    @Param('profileId') profileId: string,
    @Body() body: unknown,
  ): Promise<AccountProfileVersion> {
    return accountProfileVersionSchema.parse(
      await this.accountService.updateProfileDraft(
        parseRequest(z.uuid(), accountId),
        parseRequest(z.uuid(), profileId),
        parseRequest(createAccountProfileDraftSchema, body),
      ),
    );
  }

  @Post(':accountId/profile-versions/:profileId/activate')
  @ApiOperation({ summary: 'Accept a candidate as the single active account profile' })
  async activateProfile(
    @Param('accountId') accountId: string,
    @Param('profileId') profileId: string,
  ): Promise<AccountProfileVersion> {
    return accountProfileVersionSchema.parse(
      await this.accountService.activateProfile(
        parseRequest(z.uuid(), accountId),
        parseRequest(z.uuid(), profileId),
      ),
    );
  }
}
