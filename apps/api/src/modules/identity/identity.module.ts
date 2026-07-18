import { type DynamicModule, Module } from '@nestjs/common';

import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { LOCAL_USER_REPOSITORY, type LocalUserRepository } from './local-user.repository.js';
import { PinHasher } from './pin-hasher.js';

@Module({})
export class IdentityModule {
  static register(repository: LocalUserRepository): DynamicModule {
    return {
      module: IdentityModule,
      controllers: [IdentityController],
      providers: [
        IdentityService,
        PinHasher,
        { provide: LOCAL_USER_REPOSITORY, useValue: repository },
      ],
      exports: [IdentityService],
    };
  }
}
