import type {
  ContentProject,
  CreateContentProject,
  LinkProjectAccount,
  UpdateContentProject,
} from '@content-writing/contracts';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import { PROJECT_REPOSITORY, type ProjectRepository } from './project.repository.js';

@Injectable()
export class ProjectService implements OnModuleDestroy {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository,
    private readonly identityService: IdentityService,
  ) {}

  async create(input: CreateContentProject): Promise<ContentProject> {
    const user = await this.identityService.getCurrentUser();
    const project = await this.repository.create(user.id, input);
    if (!project) {
      throw new BadRequestException('The selected primary account is unavailable or archived.');
    }
    return project;
  }

  async list(): Promise<readonly ContentProject[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.list(user.id);
  }

  async get(projectId: string): Promise<ContentProject> {
    const user = await this.identityService.getCurrentUser();
    const project = await this.repository.get(user.id, projectId);
    if (!project) throw new NotFoundException('Content project not found.');
    return project;
  }

  async update(projectId: string, input: UpdateContentProject): Promise<ContentProject> {
    const user = await this.identityService.getCurrentUser();
    const project = await this.repository.update(user.id, projectId, input);
    if (!project) throw new NotFoundException('Content project not found.');
    return project;
  }

  async linkAccount(projectId: string, input: LinkProjectAccount): Promise<ContentProject> {
    const user = await this.identityService.getCurrentUser();
    if (!(await this.repository.get(user.id, projectId))) {
      throw new NotFoundException('Content project not found.');
    }
    const project = await this.repository.linkAccount(user.id, projectId, input);
    if (!project) throw new BadRequestException('The selected account is unavailable or archived.');
    return project;
  }

  async unlinkAccount(projectId: string, accountId: string): Promise<ContentProject> {
    const user = await this.identityService.getCurrentUser();
    const project = await this.repository.unlinkAccount(user.id, projectId, accountId);
    if (!project) throw new NotFoundException('Content project not found.');
    return project;
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
