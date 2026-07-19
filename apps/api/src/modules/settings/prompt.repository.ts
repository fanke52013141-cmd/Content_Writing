import type {
  ActivatePromptVersion,
  CreatePrompt,
  CreatePromptVersion,
  Prompt,
} from '@content-writing/contracts';
import { PromptStore, type PromptAggregateRecord } from '@content-writing/database';

export interface PromptRepository {
  list(ownerUserId: string): Promise<readonly Prompt[]>;
  create(ownerUserId: string, input: CreatePrompt): Promise<Prompt | null>;
  createVersion(
    ownerUserId: string,
    promptId: string,
    input: CreatePromptVersion,
  ): Promise<Prompt | null>;
  activate(
    ownerUserId: string,
    promptId: string,
    versionId: string,
    input: ActivatePromptVersion,
  ): Promise<Prompt | null>;
  close?(): Promise<void>;
}

export const PROMPT_REPOSITORY = Symbol('PROMPT_REPOSITORY');

function mapRecord(record: PromptAggregateRecord): Prompt {
  return {
    id: record.prompt.id,
    capabilityKey: record.prompt.capabilityKey as Prompt['capabilityKey'],
    name: record.prompt.name,
    safetyBoundary: record.prompt.safetyBoundary,
    versions: record.versions.map((version) => ({
      id: version.id,
      promptId: version.promptId,
      versionNumber: version.versionNumber,
      status: version.status,
      isDefault: version.isDefault,
      body: version.body,
      createdAt: version.createdAt.toISOString(),
      activatedAt: version.activatedAt?.toISOString() ?? null,
    })),
    createdAt: record.prompt.createdAt.toISOString(),
    updatedAt: record.prompt.updatedAt.toISOString(),
  };
}

export class PostgresPromptRepository implements PromptRepository {
  private readonly store: PromptStore;
  constructor(databaseUrl: string) {
    this.store = new PromptStore(databaseUrl);
  }
  async list(ownerUserId: string): Promise<readonly Prompt[]> {
    return (await this.store.list(ownerUserId)).map(mapRecord);
  }
  async create(ownerUserId: string, input: CreatePrompt): Promise<Prompt | null> {
    const record = await this.store.create(ownerUserId, input);
    return record ? mapRecord(record) : null;
  }
  async createVersion(
    ownerUserId: string,
    promptId: string,
    input: CreatePromptVersion,
  ): Promise<Prompt | null> {
    const record = await this.store.createVersion(ownerUserId, promptId, input);
    return record ? mapRecord(record) : null;
  }
  async activate(
    ownerUserId: string,
    promptId: string,
    versionId: string,
    input: ActivatePromptVersion,
  ): Promise<Prompt | null> {
    const record = await this.store.activate(ownerUserId, promptId, versionId, input.isDefault);
    return record ? mapRecord(record) : null;
  }
  close(): Promise<void> {
    return this.store.close();
  }
}

export class InMemoryPromptRepository implements PromptRepository {
  private prompts = new Map<string, Prompt>();
  list(ownerUserId: string): Promise<readonly Prompt[]> {
    void ownerUserId;
    return Promise.resolve([...this.prompts.values()].map((item) => structuredClone(item)));
  }
  create(ownerUserId: string, input: CreatePrompt): Promise<Prompt> {
    void ownerUserId;
    const now = new Date().toISOString();
    const promptId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const prompt: Prompt = {
      id: promptId,
      capabilityKey: input.capabilityKey,
      name: input.name,
      safetyBoundary: input.safetyBoundary,
      createdAt: now,
      updatedAt: now,
      versions: [
        {
          id: versionId,
          promptId,
          versionNumber: 1,
          status: 'draft',
          isDefault: false,
          body: input.body,
          createdAt: now,
          activatedAt: null,
        },
      ],
    };
    this.prompts.set(promptId, prompt);
    return Promise.resolve(structuredClone(prompt));
  }
  createVersion(
    ownerUserId: string,
    promptId: string,
    input: CreatePromptVersion,
  ): Promise<Prompt | null> {
    void ownerUserId;
    const prompt = this.prompts.get(promptId);
    if (!prompt) return Promise.resolve(null);
    const now = new Date().toISOString();
    const next: Prompt = {
      ...prompt,
      updatedAt: now,
      versions: [
        ...prompt.versions,
        {
          id: crypto.randomUUID(),
          promptId,
          versionNumber: prompt.versions.length + 1,
          status: 'draft',
          isDefault: false,
          body: input.body,
          createdAt: now,
          activatedAt: null,
        },
      ],
    };
    this.prompts.set(promptId, next);
    return Promise.resolve(structuredClone(next));
  }
  activate(
    ownerUserId: string,
    promptId: string,
    versionId: string,
    input: ActivatePromptVersion,
  ): Promise<Prompt | null> {
    void ownerUserId;
    const prompt = this.prompts.get(promptId);
    if (!prompt || !prompt.versions.some((version) => version.id === versionId))
      return Promise.resolve(null);
    const now = new Date().toISOString();
    const next: Prompt = {
      ...prompt,
      updatedAt: now,
      versions: prompt.versions.map((version) => ({
        ...version,
        isDefault: input.isDefault ? version.id === versionId : version.isDefault,
        status: version.id === versionId ? 'active' : version.status,
        activatedAt: version.id === versionId ? now : version.activatedAt,
      })),
    };
    this.prompts.set(promptId, next);
    return Promise.resolve(structuredClone(next));
  }
}
