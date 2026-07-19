import type { DeletableObjectType, DeletionAudit, DeletionMode } from '@content-writing/contracts';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../materials/storage.provider.js';
import { DELETION_REPOSITORY, type DeletionRepository } from './deletion.repository.js';

@Injectable()
export class DeletionService implements OnModuleDestroy {
  constructor(
    @Inject(DELETION_REPOSITORY) private readonly repository: DeletionRepository,
    private readonly identityService: IdentityService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async delete(
    objectType: DeletableObjectType,
    objectId: string,
    mode: DeletionMode,
  ): Promise<DeletionAudit> {
    const user = await this.identityService.getCurrentUser();
    const result = await this.repository.delete(user.id, objectType, objectId, mode);
    if (result.kind === 'not_found') throw new NotFoundException('Content object not found.');
    if (result.kind === 'blocked') throw new ConflictException(result.reason);
    if (mode === 'permanent' && result.storageKeys.length > 0) {
      const failures = await Promise.allSettled(
        result.storageKeys.map((key) => this.storage.delete(key)),
      );
      if (failures.some((item) => item.status === 'rejected')) {
        throw new BadRequestException(
          'Content deleted, but one or more local files could not be removed.',
        );
      }
    }
    return result.audit;
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
