import type {
  CreateAccount,
  CreateAccountProfileDraft,
  UpdateAccount,
} from '@content-writing/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';

import { createDatabase } from './client.js';
import {
  accountProfileVersions,
  accounts,
  type AccountProfileVersionRecord,
  type AccountRecord,
} from './schema.js';

export type ProfileMutationResult =
  | { kind: 'ok'; profile: AccountProfileVersionRecord }
  | { kind: 'not_found' }
  | { kind: 'not_editable' }
  | { kind: 'incomplete' };

export class AccountStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateAccount): Promise<AccountRecord> {
    const [account] = await this.client.db
      .insert(accounts)
      .values({ ownerUserId, name: input.name, description: input.description })
      .returning();
    if (!account) throw new Error('Account creation failed.');
    return account;
  }

  list(ownerUserId: string): Promise<readonly AccountRecord[]> {
    return this.client.db
      .select()
      .from(accounts)
      .where(eq(accounts.ownerUserId, ownerUserId))
      .orderBy(desc(accounts.updatedAt));
  }

  async get(ownerUserId: string, accountId: string): Promise<AccountRecord | null> {
    const [account] = await this.client.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, ownerUserId)))
      .limit(1);
    return account ?? null;
  }

  async update(
    ownerUserId: string,
    accountId: string,
    input: UpdateAccount,
  ): Promise<AccountRecord | null> {
    const now = new Date();
    const [account] = await this.client.db
      .update(accounts)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.status === undefined
          ? {}
          : {
              status: input.status,
              archivedAt: input.status === 'archived' ? now : null,
            }),
        updatedAt: now,
      })
      .where(and(eq(accounts.id, accountId), eq(accounts.ownerUserId, ownerUserId)))
      .returning();
    return account ?? null;
  }

  async createProfileDraft(
    ownerUserId: string,
    accountId: string,
    input: CreateAccountProfileDraft,
  ): Promise<AccountProfileVersionRecord | null> {
    return this.client.db.transaction(async (transaction) => {
      const account = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM accounts
        WHERE id = ${accountId} AND owner_user_id = ${ownerUserId}
        FOR UPDATE
      `);
      if (account.length === 0) return null;

      const versions = await transaction
        .select({ versionNumber: accountProfileVersions.versionNumber })
        .from(accountProfileVersions)
        .where(eq(accountProfileVersions.accountId, accountId))
        .orderBy(desc(accountProfileVersions.versionNumber))
        .limit(1);
      const versionNumber = (versions[0]?.versionNumber ?? 0) + 1;
      const [profile] = await transaction
        .insert(accountProfileVersions)
        .values({ accountId, versionNumber, ...input, source: 'manual' })
        .returning();
      if (!profile) throw new Error('Account profile draft creation failed.');
      return profile;
    });
  }

  async listProfiles(
    ownerUserId: string,
    accountId: string,
  ): Promise<readonly AccountProfileVersionRecord[] | null> {
    if (!(await this.get(ownerUserId, accountId))) return null;
    return this.client.db
      .select()
      .from(accountProfileVersions)
      .where(eq(accountProfileVersions.accountId, accountId))
      .orderBy(desc(accountProfileVersions.versionNumber));
  }

  async updateProfileDraft(
    ownerUserId: string,
    accountId: string,
    profileId: string,
    input: CreateAccountProfileDraft,
  ): Promise<ProfileMutationResult> {
    if (!(await this.get(ownerUserId, accountId))) return { kind: 'not_found' };
    const [current] = await this.client.db
      .select()
      .from(accountProfileVersions)
      .where(
        and(
          eq(accountProfileVersions.id, profileId),
          eq(accountProfileVersions.accountId, accountId),
        ),
      )
      .limit(1);
    if (!current) return { kind: 'not_found' };
    if (current.status !== 'draft' || current.source !== 'manual') {
      return { kind: 'not_editable' };
    }
    const [profile] = await this.client.db
      .update(accountProfileVersions)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(accountProfileVersions.id, profileId))
      .returning();
    if (!profile) return { kind: 'not_found' };
    return { kind: 'ok', profile };
  }

  activateProfile(
    ownerUserId: string,
    accountId: string,
    profileId: string,
  ): Promise<ProfileMutationResult> {
    return this.client.db.transaction(async (transaction) => {
      const account = await transaction.execute<{ id: string }>(sql`
        SELECT id FROM accounts
        WHERE id = ${accountId} AND owner_user_id = ${ownerUserId}
        FOR UPDATE
      `);
      if (account.length === 0) return { kind: 'not_found' };

      const [target] = await transaction
        .select()
        .from(accountProfileVersions)
        .where(
          and(
            eq(accountProfileVersions.id, profileId),
            eq(accountProfileVersions.accountId, accountId),
          ),
        )
        .limit(1);
      if (!target) return { kind: 'not_found' };
      if (target.status !== 'draft') return { kind: 'not_editable' };
      if (
        !target.positioningStatement.trim() ||
        !target.targetAudience.trim() ||
        !target.valueProposition.trim()
      ) {
        return { kind: 'incomplete' };
      }

      const now = new Date();
      await transaction
        .update(accountProfileVersions)
        .set({ status: 'historical', supersededAt: now, updatedAt: now })
        .where(
          and(
            eq(accountProfileVersions.accountId, accountId),
            eq(accountProfileVersions.status, 'active'),
          ),
        );
      const [profile] = await transaction
        .update(accountProfileVersions)
        .set({ status: 'active', activatedAt: now, updatedAt: now })
        .where(eq(accountProfileVersions.id, profileId))
        .returning();
      if (!profile) return { kind: 'not_found' };
      return { kind: 'ok', profile };
    });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
