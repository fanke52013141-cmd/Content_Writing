import type {
  Account,
  AccountProfileVersion,
  CreateAccount,
  CreateAccountProfileDraft,
  UpdateAccount,
} from '@content-writing/contracts';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import {
  ACCOUNT_REPOSITORY,
  type AccountProfileMutation,
  type AccountRepository,
} from './account.repository.js';

@Injectable()
export class AccountService implements OnModuleDestroy {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly repository: AccountRepository,
    private readonly identityService: IdentityService,
  ) {}

  private resolveProfileMutation(result: AccountProfileMutation): AccountProfileVersion {
    if (result.kind === 'ok') return result.profile;
    if (result.kind === 'not_found') throw new NotFoundException('Account profile not found.');
    if (result.kind === 'incomplete') {
      throw new BadRequestException(
        'Positioning statement, target audience and value proposition are required before activation.',
      );
    }
    throw new ConflictException('Only editable manual drafts can be changed or activated.');
  }

  async create(input: CreateAccount): Promise<Account> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.create(user.id, input);
  }

  async list(): Promise<readonly Account[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.list(user.id);
  }

  async get(accountId: string): Promise<Account> {
    const user = await this.identityService.getCurrentUser();
    const account = await this.repository.get(user.id, accountId);
    if (!account) throw new NotFoundException('Account not found.');
    return account;
  }

  async update(accountId: string, input: UpdateAccount): Promise<Account> {
    const user = await this.identityService.getCurrentUser();
    const account = await this.repository.update(user.id, accountId, input);
    if (!account) throw new NotFoundException('Account not found.');
    return account;
  }

  async createProfileDraft(
    accountId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileVersion> {
    const user = await this.identityService.getCurrentUser();
    const profile = await this.repository.createProfileDraft(user.id, accountId, input);
    if (!profile) throw new NotFoundException('Account not found.');
    return profile;
  }

  async listProfiles(accountId: string): Promise<readonly AccountProfileVersion[]> {
    const user = await this.identityService.getCurrentUser();
    const profiles = await this.repository.listProfiles(user.id, accountId);
    if (!profiles) throw new NotFoundException('Account not found.');
    return profiles;
  }

  async updateProfileDraft(
    accountId: string,
    profileId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileVersion> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveProfileMutation(
      await this.repository.updateProfileDraft(user.id, accountId, profileId, input),
    );
  }

  async activateProfile(accountId: string, profileId: string): Promise<AccountProfileVersion> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveProfileMutation(
      await this.repository.activateProfile(user.id, accountId, profileId),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
