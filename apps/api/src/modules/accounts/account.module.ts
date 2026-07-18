import { type DynamicModule, Module } from '@nestjs/common';

import { AccountController } from './account.controller.js';
import { ACCOUNT_REPOSITORY, type AccountRepository } from './account.repository.js';
import { AccountService } from './account.service.js';

@Module({})
export class AccountModule {
  static register(repository: AccountRepository, identityModule: DynamicModule): DynamicModule {
    return {
      module: AccountModule,
      imports: [identityModule],
      controllers: [AccountController],
      providers: [AccountService, { provide: ACCOUNT_REPOSITORY, useValue: repository }],
    };
  }
}
