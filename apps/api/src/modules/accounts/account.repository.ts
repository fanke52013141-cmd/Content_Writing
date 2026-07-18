import type {
  Account,
  AccountProfileVersion,
  CreateAccount,
  CreateAccountProfileDraft,
  UpdateAccount,
} from '@content-writing/contracts';
import {
  AccountStore,
  type AccountProfileVersionRecord,
  type AccountRecord,
} from '@content-writing/database';

export type AccountProfileMutation =
  | { kind: 'ok'; profile: AccountProfileVersion }
  | { kind: 'not_found' }
  | { kind: 'not_editable' }
  | { kind: 'incomplete' };

export interface AccountRepository {
  create(ownerUserId: string, input: CreateAccount): Promise<Account>;
  list(ownerUserId: string): Promise<readonly Account[]>;
  get(ownerUserId: string, accountId: string): Promise<Account | null>;
  update(ownerUserId: string, accountId: string, input: UpdateAccount): Promise<Account | null>;
  createProfileDraft(
    ownerUserId: string,
    accountId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileVersion | null>;
  listProfiles(
    ownerUserId: string,
    accountId: string,
  ): Promise<readonly AccountProfileVersion[] | null>;
  updateProfileDraft(
    ownerUserId: string,
    accountId: string,
    profileId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileMutation>;
  activateProfile(
    ownerUserId: string,
    accountId: string,
    profileId: string,
  ): Promise<AccountProfileMutation>;
  close?(): Promise<void>;
}

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

function accountFromRecord(record: AccountRecord): Account {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString() ?? null,
  };
}

function profileFromRecord(record: AccountProfileVersionRecord): AccountProfileVersion {
  return {
    id: record.id,
    accountId: record.accountId,
    versionNumber: record.versionNumber,
    status: record.status,
    source: record.source,
    positioningStatement: record.positioningStatement,
    targetAudience: record.targetAudience,
    valueProposition: record.valueProposition,
    contentPillars: record.contentPillars,
    toneKeywords: record.toneKeywords,
    writingStyle: record.writingStyle,
    contentBoundaries: record.contentBoundaries,
    versionNote: record.versionNote,
    sourceGenerationId: record.sourceGenerationId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    activatedAt: record.activatedAt?.toISOString() ?? null,
    supersededAt: record.supersededAt?.toISOString() ?? null,
  };
}

export class PostgresAccountRepository implements AccountRepository {
  private readonly store: AccountStore;

  constructor(databaseUrl: string) {
    this.store = new AccountStore(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateAccount): Promise<Account> {
    return accountFromRecord(await this.store.create(ownerUserId, input));
  }

  async list(ownerUserId: string): Promise<readonly Account[]> {
    return (await this.store.list(ownerUserId)).map(accountFromRecord);
  }

  async get(ownerUserId: string, accountId: string): Promise<Account | null> {
    const record = await this.store.get(ownerUserId, accountId);
    return record ? accountFromRecord(record) : null;
  }

  async update(
    ownerUserId: string,
    accountId: string,
    input: UpdateAccount,
  ): Promise<Account | null> {
    const record = await this.store.update(ownerUserId, accountId, input);
    return record ? accountFromRecord(record) : null;
  }

  async createProfileDraft(
    ownerUserId: string,
    accountId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileVersion | null> {
    const record = await this.store.createProfileDraft(ownerUserId, accountId, input);
    return record ? profileFromRecord(record) : null;
  }

  async listProfiles(
    ownerUserId: string,
    accountId: string,
  ): Promise<readonly AccountProfileVersion[] | null> {
    const records = await this.store.listProfiles(ownerUserId, accountId);
    return records?.map(profileFromRecord) ?? null;
  }

  async updateProfileDraft(
    ownerUserId: string,
    accountId: string,
    profileId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileMutation> {
    const result = await this.store.updateProfileDraft(ownerUserId, accountId, profileId, input);
    return result.kind === 'ok'
      ? { kind: 'ok', profile: profileFromRecord(result.profile) }
      : result;
  }

  async activateProfile(
    ownerUserId: string,
    accountId: string,
    profileId: string,
  ): Promise<AccountProfileMutation> {
    const result = await this.store.activateProfile(ownerUserId, accountId, profileId);
    return result.kind === 'ok'
      ? { kind: 'ok', profile: profileFromRecord(result.profile) }
      : result;
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

interface OwnedAccount extends Account {
  ownerUserId: string;
}

export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, OwnedAccount>();
  private readonly profiles = new Map<string, AccountProfileVersion>();

  create(ownerUserId: string, input: CreateAccount): Promise<Account> {
    const now = new Date().toISOString();
    const account: OwnedAccount = {
      id: crypto.randomUUID(),
      ownerUserId,
      name: input.name,
      description: input.description,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.accounts.set(account.id, account);
    return Promise.resolve(account);
  }

  list(ownerUserId: string): Promise<readonly Account[]> {
    return Promise.resolve(
      [...this.accounts.values()].filter((item) => item.ownerUserId === ownerUserId),
    );
  }

  get(ownerUserId: string, accountId: string): Promise<Account | null> {
    const account = this.accounts.get(accountId);
    return Promise.resolve(account?.ownerUserId === ownerUserId ? account : null);
  }

  update(ownerUserId: string, accountId: string, input: UpdateAccount): Promise<Account | null> {
    const account = this.accounts.get(accountId);
    if (!account || account.ownerUserId !== ownerUserId) return Promise.resolve(null);
    const now = new Date().toISOString();
    const updated: OwnedAccount = {
      ...account,
      ...input,
      archivedAt:
        input.status === 'archived' ? now : input.status === undefined ? account.archivedAt : null,
      updatedAt: now,
    };
    this.accounts.set(accountId, updated);
    return Promise.resolve(updated);
  }

  async createProfileDraft(
    ownerUserId: string,
    accountId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileVersion | null> {
    if (!(await this.get(ownerUserId, accountId))) return null;
    const now = new Date().toISOString();
    const accountProfiles = [...this.profiles.values()].filter(
      (profile) => profile.accountId === accountId,
    );
    const profile: AccountProfileVersion = {
      id: crypto.randomUUID(),
      accountId,
      versionNumber: Math.max(0, ...accountProfiles.map((item) => item.versionNumber)) + 1,
      status: 'draft',
      source: 'manual',
      ...input,
      sourceGenerationId: null,
      createdAt: now,
      updatedAt: now,
      activatedAt: null,
      supersededAt: null,
    };
    this.profiles.set(profile.id, profile);
    return profile;
  }

  async listProfiles(
    ownerUserId: string,
    accountId: string,
  ): Promise<readonly AccountProfileVersion[] | null> {
    if (!(await this.get(ownerUserId, accountId))) return null;
    return [...this.profiles.values()]
      .filter((profile) => profile.accountId === accountId)
      .sort((left, right) => right.versionNumber - left.versionNumber);
  }

  async updateProfileDraft(
    ownerUserId: string,
    accountId: string,
    profileId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileMutation> {
    if (!(await this.get(ownerUserId, accountId))) return { kind: 'not_found' };
    const profile = this.profiles.get(profileId);
    if (!profile || profile.accountId !== accountId) return { kind: 'not_found' };
    if (profile.status !== 'draft' || profile.source !== 'manual') {
      return { kind: 'not_editable' };
    }
    const updated: AccountProfileVersion = {
      ...profile,
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.profiles.set(profileId, updated);
    return { kind: 'ok', profile: updated };
  }

  async activateProfile(
    ownerUserId: string,
    accountId: string,
    profileId: string,
  ): Promise<AccountProfileMutation> {
    if (!(await this.get(ownerUserId, accountId))) return { kind: 'not_found' };
    const profile = this.profiles.get(profileId);
    if (!profile || profile.accountId !== accountId) return { kind: 'not_found' };
    if (profile.status !== 'draft') return { kind: 'not_editable' };
    if (!profile.positioningStatement || !profile.targetAudience || !profile.valueProposition) {
      return { kind: 'incomplete' };
    }
    const now = new Date().toISOString();
    for (const [id, existing] of this.profiles) {
      if (existing.accountId === accountId && existing.status === 'active') {
        this.profiles.set(id, {
          ...existing,
          status: 'historical',
          updatedAt: now,
          supersededAt: now,
        });
      }
    }
    const activated: AccountProfileVersion = {
      ...profile,
      status: 'active',
      updatedAt: now,
      activatedAt: now,
    };
    this.profiles.set(profileId, activated);
    return { kind: 'ok', profile: activated };
  }
}
