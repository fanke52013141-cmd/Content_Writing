import { LocalUserStore } from '@content-writing/database';

export interface LocalUserEntity {
  id: string;
  displayName: string;
  pinEnabled: boolean;
  pinHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalUserRepository {
  get(): Promise<LocalUserEntity>;
  updateDisplayName(displayName: string): Promise<LocalUserEntity>;
  setPinHash(pinHash: string): Promise<LocalUserEntity>;
  close?(): Promise<void>;
}

export const LOCAL_USER_REPOSITORY = Symbol('LOCAL_USER_REPOSITORY');

export class InMemoryLocalUserRepository implements LocalUserRepository {
  private user: LocalUserEntity;

  constructor(now = new Date()) {
    this.user = {
      id: crypto.randomUUID(),
      displayName: '本地创作者',
      pinEnabled: false,
      pinHash: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  get(): Promise<LocalUserEntity> {
    return Promise.resolve(structuredClone(this.user));
  }

  async updateDisplayName(displayName: string): Promise<LocalUserEntity> {
    this.user = { ...this.user, displayName, updatedAt: new Date() };
    return this.get();
  }

  async setPinHash(pinHash: string): Promise<LocalUserEntity> {
    this.user = { ...this.user, pinEnabled: true, pinHash, updatedAt: new Date() };
    return this.get();
  }
}

export class PostgresLocalUserRepository implements LocalUserRepository {
  private readonly store: LocalUserStore;

  constructor(databaseUrl: string) {
    this.store = new LocalUserStore(databaseUrl);
  }

  async get(): Promise<LocalUserEntity> {
    return this.store.get();
  }

  async updateDisplayName(displayName: string): Promise<LocalUserEntity> {
    return this.store.updateDisplayName(displayName);
  }

  async setPinHash(pinHash: string): Promise<LocalUserEntity> {
    return this.store.setPinHash(pinHash);
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
