import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { loadEnvironment } from './config/environment.js';
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
}

function createRuntimeRepositories(): {
  localUserRepository: LocalUserRepository;
  generationRepository: GenerationRepository;
} {
  const { databaseUrl } = loadEnvironment();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required unless a test repository is provided.');
  }
  return {
    localUserRepository: new PostgresLocalUserRepository(databaseUrl),
    generationRepository: new PostgresGenerationRepository(databaseUrl),
  };
}

export async function createApp(options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const runtimeRepositories =
    options.localUserRepository && options.generationRepository
      ? null
      : createRuntimeRepositories();
  const localUserRepository =
    options.localUserRepository ?? runtimeRepositories?.localUserRepository;
  const generationRepository =
    options.generationRepository ?? runtimeRepositories?.generationRepository;
  if (!localUserRepository || !generationRepository) {
    throw new Error('Both local-user and generation repositories are required.');
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(localUserRepository, generationRepository),
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
