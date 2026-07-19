import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
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
import {
  MatureDocumentExtractor,
  SafeWebpageExtractor,
  type DocumentExtractor,
  type WebpageExtractor,
} from './modules/materials/material-extractor.js';
import {
  PostgresMaterialRepository,
  type MaterialRepository,
} from './modules/materials/material.repository.js';
import {
  LocalFileStorageProvider,
  type StorageProvider,
} from './modules/materials/storage.provider.js';
import {
  PostgresProjectRepository,
  type ProjectRepository,
} from './modules/projects/project.repository.js';
import {
  PostgresTopicRepository,
  type TopicRepository,
} from './modules/topics/topic.repository.js';
import {
  InMemoryOutlineRepository,
  PostgresOutlineRepository,
  type OutlineRepository,
} from './modules/outlines/outline.repository.js';
import {
  InMemoryArticleRepository,
  PostgresArticleRepository,
  type ArticleRepository,
} from './modules/articles/article.repository.js';
import {
  InMemoryDiscoveryRepository,
  PostgresDiscoveryRepository,
  type DiscoveryRepository,
} from './modules/discovery/discovery.repository.js';
import {
  DailyHotApiProvider,
  SearxngSearchProvider,
  StaticHotTopicProvider,
  StaticSearchProvider,
} from './modules/discovery/external.providers.js';
import type { ExternalSearchProvider, HotTopicProvider } from '@content-writing/contracts';

export interface CreateAppOptions {
  localUserRepository?: LocalUserRepository;
  generationRepository?: GenerationRepository;
  accountRepository?: AccountRepository;
  projectRepository?: ProjectRepository;
  topicRepository?: TopicRepository;
  materialRepository?: MaterialRepository;
  outlineRepository?: OutlineRepository;
  articleRepository?: ArticleRepository;
  storageProvider?: StorageProvider;
  documentExtractor?: DocumentExtractor;
  webpageExtractor?: WebpageExtractor;
  discoveryRepository?: DiscoveryRepository;
  hotTopicProvider?: HotTopicProvider;
  searchProvider?: ExternalSearchProvider;
}

function createRuntimeRepositories(): {
  localUserRepository: LocalUserRepository;
  generationRepository: GenerationRepository;
  accountRepository: AccountRepository;
  projectRepository: ProjectRepository;
  topicRepository: TopicRepository;
  materialRepository: MaterialRepository;
  outlineRepository: OutlineRepository;
  articleRepository: ArticleRepository;
  discoveryRepository: DiscoveryRepository;
  hotTopicProvider: HotTopicProvider;
  searchProvider: ExternalSearchProvider;
} {
  const { databaseUrl } = loadEnvironment();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required unless a test repository is provided.');
  }
  const environment = loadEnvironment();
  return {
    localUserRepository: new PostgresLocalUserRepository(databaseUrl),
    generationRepository: new PostgresGenerationRepository(databaseUrl),
    accountRepository: new PostgresAccountRepository(databaseUrl),
    projectRepository: new PostgresProjectRepository(databaseUrl),
    topicRepository: new PostgresTopicRepository(databaseUrl),
    materialRepository: new PostgresMaterialRepository(databaseUrl),
    outlineRepository: new PostgresOutlineRepository(databaseUrl),
    articleRepository: new PostgresArticleRepository(databaseUrl),
    discoveryRepository: new PostgresDiscoveryRepository(databaseUrl),
    hotTopicProvider: new DailyHotApiProvider(environment.hotTopicProviderUrl),
    searchProvider: new SearxngSearchProvider(environment.searchProviderUrl),
  };
}

export async function createApp(options: CreateAppOptions = {}): Promise<NestFastifyApplication> {
  const runtimeRepositories =
    options.localUserRepository &&
    options.generationRepository &&
    options.accountRepository &&
    options.projectRepository &&
    options.topicRepository &&
    options.materialRepository
      ? null
      : createRuntimeRepositories();
  const localUserRepository =
    options.localUserRepository ?? runtimeRepositories?.localUserRepository;
  const generationRepository =
    options.generationRepository ?? runtimeRepositories?.generationRepository;
  const accountRepository = options.accountRepository ?? runtimeRepositories?.accountRepository;
  const projectRepository = options.projectRepository ?? runtimeRepositories?.projectRepository;
  const topicRepository = options.topicRepository ?? runtimeRepositories?.topicRepository;
  const materialRepository = options.materialRepository ?? runtimeRepositories?.materialRepository;
  const outlineRepository =
    options.outlineRepository ??
    runtimeRepositories?.outlineRepository ??
    new InMemoryOutlineRepository();
  const articleRepository =
    options.articleRepository ??
    runtimeRepositories?.articleRepository ??
    new InMemoryArticleRepository();
  const discoveryRepository =
    options.discoveryRepository ??
    runtimeRepositories?.discoveryRepository ??
    new InMemoryDiscoveryRepository();
  const hotTopicProvider =
    options.hotTopicProvider ??
    runtimeRepositories?.hotTopicProvider ??
    new StaticHotTopicProvider();
  const searchProvider =
    options.searchProvider ?? runtimeRepositories?.searchProvider ?? new StaticSearchProvider();
  const environment = loadEnvironment();
  const storageProvider =
    options.storageProvider ?? new LocalFileStorageProvider(environment.storageRoot);
  const documentExtractor = options.documentExtractor ?? new MatureDocumentExtractor();
  const webpageExtractor = options.webpageExtractor ?? new SafeWebpageExtractor();
  if (
    !localUserRepository ||
    !generationRepository ||
    !accountRepository ||
    !projectRepository ||
    !topicRepository ||
    !materialRepository
  ) {
    throw new Error(
      'Local-user, generation, account, project, topic and material repositories are required.',
    );
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(
      localUserRepository,
      generationRepository,
      accountRepository,
      projectRepository,
      topicRepository,
      materialRepository,
      outlineRepository,
      articleRepository,
      storageProvider,
      documentExtractor,
      webpageExtractor,
      discoveryRepository,
      hotTopicProvider,
      searchProvider,
    ),
    new FastifyAdapter({
      bodyLimit: 25 * 1024 * 1024,
      genReqId: () => crypto.randomUUID(),
      trustProxy: false,
    }),
    { bufferLogs: true },
  );

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(multipart, {
    limits: { files: 1, fileSize: 20 * 1024 * 1024, fields: 4, fieldSize: 20_000 },
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
