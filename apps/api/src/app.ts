import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { loadEnvironment } from './config/environment.js';
import {
  PostgresAccountRepository,
  type AccountRepository,
} from './modules/accounts/account.repository.js';
import {
  PostgresGenerationRepository,
  type GenerationRepository,
} from './modules/generations/generation.repository.js';
import {
  PostgresLocalUserRepository,
  type LocalUserRepository,
} from './modules/identity/local-user.repository.js';

export interface CreateAppOptions {
  localUserRepository?: LocalUserRepository;
  generationRepository?: GenerationRepository;
  accountRepository?: AccountRepository;
}

function createRuntimeRepositories(): {
  localUserRepository: LocalUserRepository;
  generationRepository: GenerationRepository;
  accountRepository: AccountRepository;
} {
  const { databaseUrl } = loadEnvironment();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required unless a test repository is provided.');
  }
  return {
    localUserRepository: new PostgresLocalUserRepository(databaseUrl),
    generationRepository: new PostgresGenerationRepository(databaseUrl),
    accountRepository: new PostgresAccountRepository(databaseUrl),
  };
}

export async function createApp(options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const runtimeRepositories =
    options.localUserRepository && options.generationRepository && options.accountRepository
      ? null
      : createRuntimeRepositories();
  const localUserRepository =
    options.localUserRepository ?? runtimeRepositories?.localUserRepository;
  const generationRepository =
    options.generationRepository ?? runtimeRepositories?.generationRepository;
  const accountRepository = options.accountRepository ?? runtimeRepositories?.accountRepository;
  if (!localUserRepository || !generationRepository || !accountRepository) {
    throw new Error('Local-user, generation and account repositories are required.');
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(localUserRepository, generationRepository, accountRepository),
    new FastifyAdapter({
      bodyLimit: 1_048_576,
      genReqId: () => crypto.randomUUID(),
      trustProxy: false,
    }),
    { bufferLogs: true },
  );

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  app.enableCors({
    origin: ['http://127.0.0.1:3000', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new ApiExceptionFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle('Content Writing API')
    .setDescription('Local API for the AI content writing platform')
    .setVersion('1.1')
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
