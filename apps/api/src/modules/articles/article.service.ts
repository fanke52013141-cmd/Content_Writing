import type {
  Article,
  CreateArticle,
  CreateArticleCandidate,
  CreateReview,
  UpdateArticle,
} from '@content-writing/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import {
  ARTICLE_REPOSITORY,
  type ArticleRepository,
  type ArticleRepositoryMutation,
} from './article.repository.js';

@Injectable()
export class ArticleService implements OnModuleDestroy {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly repository: ArticleRepository,
    private readonly identityService: IdentityService,
  ) {}

  private resolveMutation(result: ArticleRepositoryMutation): Article {
    if (result.kind === 'ok') return result.article;
    if (result.kind === 'not_found') throw new NotFoundException('Article not found.');
    if (result.kind === 'invalid_version') {
      throw new BadRequestException(
        'The selected article version is unavailable or is not a candidate.',
      );
    }
    throw new BadRequestException('The selected article context is unavailable or archived.');
  }

  async create(input: CreateArticle): Promise<Article> {
    const user = await this.identityService.getCurrentUser();
    const article = await this.repository.create(user.id, input);
    if (!article)
      throw new BadRequestException('The selected article context is unavailable or archived.');
    return article;
  }

  async list(): Promise<readonly Article[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.list(user.id);
  }

  async get(articleId: string): Promise<Article> {
    const user = await this.identityService.getCurrentUser();
    const article = await this.repository.get(user.id, articleId);
    if (!article) throw new NotFoundException('Article not found.');
    return article;
  }

  async createCandidate(articleId: string, input: CreateArticleCandidate): Promise<Article> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.createCandidate(user.id, articleId, input));
  }

  async acceptCandidate(articleId: string, versionId: string): Promise<Article> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(
      await this.repository.acceptCandidate(user.id, articleId, versionId),
    );
  }

  async createReview(articleId: string, input: CreateReview): Promise<Article> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.createReview(user.id, articleId, input));
  }

  async update(articleId: string, input: UpdateArticle): Promise<Article> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.update(user.id, articleId, input));
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
