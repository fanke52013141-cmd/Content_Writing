import type { CreateGeneration, Generation } from '@content-writing/contracts';
import { GenerationCommandStore } from '@content-writing/database';

export interface GenerationRepository {
  create(ownerUserId: string, input: CreateGeneration): Promise<Generation>;
  get(ownerUserId: string, generationId: string): Promise<Generation | null>;
  close?(): Promise<void>;
}

export const GENERATION_REPOSITORY = Symbol('GENERATION_REPOSITORY');

export class InMemoryGenerationRepository implements GenerationRepository {
  private readonly generations = new Map<string, Generation & { ownerUserId: string }>();

  create(ownerUserId: string, input: CreateGeneration): Promise<Generation> {
    const now = new Date().toISOString();
    const generation: Generation & { ownerUserId: string } = {
      id: crypto.randomUUID(),
      ownerUserId,
      capabilityKey: input.capabilityKey,
      promptVersionId: crypto.randomUUID(),
      providerKey: input.providerKey,
      model: input.model,
      status: 'queued',
      outputText: null,
      errorCode: null,
      errorMessage: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
    };
    this.generations.set(generation.id, generation);
    return Promise.resolve(generation);
  }

  get(ownerUserId: string, generationId: string): Promise<Generation | null> {
    const generation = this.generations.get(generationId);
    if (!generation || generation.ownerUserId !== ownerUserId) return Promise.resolve(null);
    return Promise.resolve(generation);
  }
}

export class PostgresGenerationRepository implements GenerationRepository {
  private readonly store: GenerationCommandStore;

  constructor(databaseUrl: string) {
    this.store = new GenerationCommandStore(databaseUrl);
  }

  async create(ownerUserId: string, input: CreateGeneration): Promise<Generation> {
    const { generation } = await this.store.create(ownerUserId, input);
    return {
      id: generation.id,
      capabilityKey: generation.capabilityKey,
      promptVersionId: generation.promptVersionId,
      providerKey: generation.providerKey,
      model: generation.model,
      status: generation.status,
      outputText: generation.outputText,
      errorCode: generation.errorCode,
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt.toISOString(),
      startedAt: generation.startedAt?.toISOString() ?? null,
      completedAt: generation.completedAt?.toISOString() ?? null,
    };
  }

  async get(ownerUserId: string, generationId: string): Promise<Generation | null> {
    const generation = await this.store.get(ownerUserId, generationId);
    if (!generation) return null;
    return {
      id: generation.id,
      capabilityKey: generation.capabilityKey,
      promptVersionId: generation.promptVersionId,
      providerKey: generation.providerKey,
      model: generation.model,
      status: generation.status,
      outputText: generation.outputText,
      errorCode: generation.errorCode,
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt.toISOString(),
      startedAt: generation.startedAt?.toISOString() ?? null,
      completedAt: generation.completedAt?.toISOString() ?? null,
    };
  }

  close(): Promise<void> {
    return this.store.close();
  }
}
