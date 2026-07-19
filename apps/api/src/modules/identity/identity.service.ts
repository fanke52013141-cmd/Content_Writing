import type {
  LocalUser,
  SetLocalPin,
  UpdateLocalUser,
  VerifyLocalPin,
} from '@content-writing/contracts';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';

import {
  LOCAL_USER_REPOSITORY,
  type LocalUserEntity,
  type LocalUserRepository,
} from './local-user.repository.js';
import { PinHasher } from './pin-hasher.js';

function toPublicUser(user: LocalUserEntity): LocalUser {
  return {
    id: user.id,
    displayName: user.displayName,
    pinEnabled: user.pinEnabled,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

@Injectable()
export class IdentityService implements OnModuleDestroy {
  constructor(
    @Inject(LOCAL_USER_REPOSITORY) private readonly repository: LocalUserRepository,
    private readonly pinHasher: PinHasher,
  ) {}

  async getCurrentUser(): Promise<LocalUser> {
    return toPublicUser(await this.repository.get());
  }

  async updateCurrentUser(input: UpdateLocalUser): Promise<LocalUser> {
    return toPublicUser(await this.repository.updateDisplayName(input.displayName));
  }

  async enablePin(input: SetLocalPin): Promise<LocalUser> {
    const hash = await this.pinHasher.hash(input.pin);
    return toPublicUser(await this.repository.setPinHash(hash));
  }

  async verifyPin(input: VerifyLocalPin): Promise<{ verified: boolean }> {
    const entity = await this.repository.get();
    if (!entity.pinEnabled || !entity.pinHash) return { verified: false };
    return { verified: await this.pinHasher.verify(input.pin, entity.pinHash) };
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
