import type {
  ContentProject,
  CreateContentProject,
  LinkProjectAccount,
  ProjectAccountLink,
  UpdateContentProject,
} from '@content-writing/contracts';
import { ProjectStore, type ProjectAggregateRecord } from '@content-writing/database';

export interface ProjectRepository {
  create(ownerUserId: string, input: CreateContentProject): Promise<ContentProject | null>;
  list(ownerUserId: string): Promise<readonly ContentProject[]>;
  get(ownerUserId: string, projectId: string): Promise<ContentProject | null>;
  update(
    ownerUserId: string,
    projectId: string,
    input: UpdateContentProject,
  ): Promise<ContentProject | null>;
  linkAccount(
    ownerUserId: string,
    projectId: string,
    input: LinkProjectAccount,
  ): Promise<ContentProject | null>;
  unlinkAccount(
    ownerUserId: string,
    projectId: string,
    accountId: string,
  ): Promise<ContentProject | null>;
  close?(): Promise<void>;
}

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

function projectFromAggregate(record: ProjectAggregateRecord): ContentProject {
  if (record.object.status === 'deleted') {
    throw new Error('Deleted content projects must not be returned.');
  }
  return {
    id: record.project.id,
    title: record.project.title,
    creationOrigin: record.project.creationOrigin,
    originNote: record.project.originNote,
    status: record.object.status,
    accountLinks: [...record.accountLinks],
    createdAt: record.object.createdAt.toISOString(),
    updatedAt: record.object.updatedAt.toISOString(),
    completedAt: record.project.completedAt?.toISOString() ?? null,
    archivedAt: record.object.archivedAt?.toISOString() ?? null,
  };
}

export class PostgresProjectRepository implements ProjectRepository {
  private readonly store: ProjectStore;

  constructor(databaseUrl: string) {
    this.store = new ProjectStore(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateContentProject): Promise<ContentProject | null> {
    const project = await this.store.create(ownerUserId, input);
    return project ? projectFromAggregate(project) : null;
  }

  async list(ownerUserId: string): Promise<readonly ContentProject[]> {
    return (await this.store.list(ownerUserId)).map(projectFromAggregate);
  }

  async get(ownerUserId: string, projectId: string): Promise<ContentProject | null> {
    const project = await this.store.get(ownerUserId, projectId);
    return project ? projectFromAggregate(project) : null;
  }

  async update(
    ownerUserId: string,
    projectId: string,
    input: UpdateContentProject,
  ): Promise<ContentProject | null> {
    const project = await this.store.update(ownerUserId, projectId, input);
    return project ? projectFromAggregate(project) : null;
  }

  async linkAccount(
    ownerUserId: string,
    projectId: string,
    input: LinkProjectAccount,
  ): Promise<ContentProject | null> {
    const project = await this.store.linkAccount(ownerUserId, projectId, input);
    return project ? projectFromAggregate(project) : null;
  }

  async unlinkAccount(
    ownerUserId: string,
    projectId: string,
    accountId: string,
  ): Promise<ContentProject | null> {
    const project = await this.store.unlinkAccount(ownerUserId, projectId, accountId);
    return project ? projectFromAggregate(project) : null;
  }

  close(): Promise<void> {
    return this.store.close();
  }
}

interface OwnedProject extends ContentProject {
  ownerUserId: string;
}

export class InMemoryProjectRepository implements ProjectRepository {
  private readonly projects = new Map<string, OwnedProject>();

  constructor(private readonly accountNames = new Map<string, string>()) {}

  create(ownerUserId: string, input: CreateContentProject): Promise<ContentProject | null> {
    if (input.primaryAccountId && !this.accountNames.has(input.primaryAccountId)) {
      return Promise.resolve(null);
    }
    const now = new Date().toISOString();
    const accountLinks: ProjectAccountLink[] = input.primaryAccountId
      ? [
          {
            accountId: input.primaryAccountId,
            accountName: this.accountNames.get(input.primaryAccountId) ?? '关联账号',
            isPrimary: true,
          },
        ]
      : [];
    const project: OwnedProject = {
      id: crypto.randomUUID(),
      ownerUserId,
      title: input.title,
      creationOrigin: input.creationOrigin,
      originNote: input.originNote,
      status: 'active',
      accountLinks,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archivedAt: null,
    };
    this.projects.set(project.id, project);
    return Promise.resolve(project);
  }

  list(ownerUserId: string): Promise<readonly ContentProject[]> {
    return Promise.resolve(
      [...this.projects.values()].filter((project) => project.ownerUserId === ownerUserId),
    );
  }

  get(ownerUserId: string, projectId: string): Promise<ContentProject | null> {
    const project = this.projects.get(projectId);
    return Promise.resolve(project?.ownerUserId === ownerUserId ? project : null);
  }

  update(
    ownerUserId: string,
    projectId: string,
    input: UpdateContentProject,
  ): Promise<ContentProject | null> {
    const project = this.projects.get(projectId);
    if (!project || project.ownerUserId !== ownerUserId) return Promise.resolve(null);
    const now = new Date().toISOString();
    const updated: OwnedProject = {
      ...project,
      ...input,
      completedAt:
        input.status === 'completed' ? now : input.status === 'active' ? null : project.completedAt,
      archivedAt:
        input.status === 'archived' ? now : input.status === undefined ? project.archivedAt : null,
      updatedAt: now,
    };
    this.projects.set(projectId, updated);
    return Promise.resolve(updated);
  }

  linkAccount(
    ownerUserId: string,
    projectId: string,
    input: LinkProjectAccount,
  ): Promise<ContentProject | null> {
    const project = this.projects.get(projectId);
    if (
      !project ||
      project.ownerUserId !== ownerUserId ||
      !this.accountNames.has(input.accountId)
    ) {
      return Promise.resolve(null);
    }
    const existing = project.accountLinks.filter((link) => link.accountId !== input.accountId);
    const links = [
      ...existing.map((link) => ({
        ...link,
        isPrimary: input.isPrimary ? false : link.isPrimary,
      })),
      {
        accountId: input.accountId,
        accountName: this.accountNames.get(input.accountId) ?? '关联账号',
        isPrimary: input.isPrimary,
      },
    ];
    const updated: OwnedProject = {
      ...project,
      accountLinks: links,
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(projectId, updated);
    return Promise.resolve(updated);
  }

  unlinkAccount(
    ownerUserId: string,
    projectId: string,
    accountId: string,
  ): Promise<ContentProject | null> {
    const project = this.projects.get(projectId);
    if (!project || project.ownerUserId !== ownerUserId) return Promise.resolve(null);
    const updated: OwnedProject = {
      ...project,
      accountLinks: project.accountLinks.filter((link) => link.accountId !== accountId),
      updatedAt: new Date().toISOString(),
    };
    this.projects.set(projectId, updated);
    return Promise.resolve(updated);
  }
}
