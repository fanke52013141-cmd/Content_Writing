import { eq } from 'drizzle-orm';

import { createDatabase } from './client.js';
import { localUsers, type LocalUserRecord } from './schema.js';

export class LocalUserStore {
  private readonly client: ReturnType<typeof createDatabase>;

  constructor(databaseUrl: string) {
    this.client = createDatabase(databaseUrl);
  }

  async get(): Promise<LocalUserRecord> {
    const [user] = await this.client.db.select().from(localUsers).limit(1);
    if (!user) throw new Error('The local user has not been initialized. Run migrations first.');
    return user;
  }

  async updateDisplayName(displayName: string): Promise<LocalUserRecord> {
    const user = await this.get();
    const [updated] = await this.client.db
      .update(localUsers)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(localUsers.id, user.id))
      .returning();
    if (!updated) throw new Error('Local user update failed.');
    return updated;
  }

  async setPinHash(pinHash: string): Promise<LocalUserRecord> {
    const user = await this.get();
    const [updated] = await this.client.db
      .update(localUsers)
      .set({ pinEnabled: true, pinHash, updatedAt: new Date() })
      .where(eq(localUsers.id, user.id))
      .returning();
    if (!updated) throw new Error('Local PIN update failed.');
    return updated;
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
