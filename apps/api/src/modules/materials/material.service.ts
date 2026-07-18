import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';

import type {
  CreateTextMaterial,
  CreateUrlMaterial,
  Material,
  MaterialKind,
  UpdateMaterial,
} from '@content-writing/contracts';
import type { CreateMaterialRecord, NewStoredFile } from '@content-writing/database';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';

import { IdentityService } from '../identity/identity.service.js';
import {
  DOCUMENT_EXTRACTOR,
  WEBPAGE_EXTRACTOR,
  type DocumentExtractor,
  type WebpageExtractor,
} from './material-extractor.js';
import {
  MATERIAL_REPOSITORY,
  type MaterialRepository,
  type MaterialRepositoryMutation,
} from './material.repository.js';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider.js';

export interface UploadedMaterialInput {
  filename: string;
  mimeType: string;
  content: Buffer;
  title?: string;
  notes?: string;
}

function sha256(content: Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

function cleanTitle(value: string): string {
  return value.trim().slice(0, 240);
}

@Injectable()
export class MaterialService implements OnModuleDestroy {
  constructor(
    @Inject(MATERIAL_REPOSITORY) private readonly repository: MaterialRepository,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(DOCUMENT_EXTRACTOR) private readonly documentExtractor: DocumentExtractor,
    @Inject(WEBPAGE_EXTRACTOR) private readonly webpageExtractor: WebpageExtractor,
    private readonly identityService: IdentityService,
  ) {}

  private resolveMutation(result: MaterialRepositoryMutation): Material {
    if (result.kind === 'ok') return result.material;
    if (result.kind === 'not_found') throw new NotFoundException('Material not found.');
    throw new BadRequestException('The selected context or review transition is unavailable.');
  }

  private async persist(
    ownerUserId: string,
    record: CreateMaterialRecord,
    writtenKeys: readonly string[],
  ): Promise<Material> {
    try {
      return await this.repository.create(ownerUserId, record);
    } catch (error) {
      await Promise.allSettled(writtenKeys.map((key) => this.storage.delete(key)));
      throw error;
    }
  }

  async createText(input: CreateTextMaterial): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    const id = crypto.randomUUID();
    return this.repository.create(user.id, {
      id,
      title: input.title,
      kind: input.kind,
      sourceText: input.content,
      extractedText: input.content,
      notes: input.notes,
      sourceUrl: null,
      sourceTitle: '',
      sourceSiteName: '',
      fetchedAt: null,
      termsReviewStatus: 'not_applicable',
      extractionWarnings: [],
      files: [],
    });
  }

  async createUrl(input: CreateUrlMaterial): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    let extraction;
    try {
      extraction = await this.webpageExtractor.extract(input.url);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Webpage extraction failed.',
      );
    }
    if (extraction.text.length > 1_000_000) {
      throw new BadRequestException('Extracted webpage text exceeds the V1 text limit.');
    }
    const id = crypto.randomUUID();
    const storageKey = `materials/${id}/raw.html`;
    const expiresAt = new Date(extraction.fetchedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    await this.storage.write(storageKey, extraction.rawHtml);
    const snapshot: NewStoredFile = {
      fileRole: 'raw_snapshot',
      storageKey,
      originalFilename: '',
      mimeType: 'text/html',
      byteSize: extraction.rawHtml.byteLength,
      sha256: sha256(extraction.rawHtml),
      expiresAt,
    };
    return this.persist(
      user.id,
      {
        id,
        title: cleanTitle(input.title || extraction.title || new URL(extraction.finalUrl).hostname),
        kind: 'webpage',
        sourceText: null,
        extractedText: extraction.text,
        notes: input.notes,
        sourceUrl: extraction.finalUrl,
        sourceTitle: extraction.title.slice(0, 500),
        sourceSiteName: extraction.siteName.slice(0, 240),
        fetchedAt: extraction.fetchedAt,
        termsReviewStatus: 'pending',
        extractionWarnings: [],
        files: [snapshot],
      },
      [storageKey],
    );
  }

  private detectKind(
    filename: string,
    mimeType: string,
    content: Buffer,
  ): Exclude<MaterialKind, 'webpage'> {
    const extension = extname(filename).toLowerCase();
    if (extension === '.txt') return 'plain_text';
    if (extension === '.md' || extension === '.markdown') return 'markdown';
    if (extension === '.docx' && content.subarray(0, 2).toString('ascii') === 'PK') return 'docx';
    if (extension === '.pdf' && content.subarray(0, 5).toString('ascii') === '%PDF-') return 'pdf';
    throw new BadRequestException(
      `Unsupported or mismatched file type (${mimeType || 'unknown'}). Use TXT, Markdown, DOCX or text PDF.`,
    );
  }

  async createFile(input: UploadedMaterialInput): Promise<Material> {
    if (input.content.byteLength === 0) throw new BadRequestException('Uploaded file is empty.');
    if (input.content.byteLength > 20 * 1024 * 1024) {
      throw new BadRequestException('Uploaded file exceeds the 20 MB V1 limit.');
    }
    const user = await this.identityService.getCurrentUser();
    const kind = this.detectKind(input.filename, input.mimeType, input.content);
    let extractedText = '';
    let warnings: readonly string[] = [];
    try {
      if (kind === 'plain_text' || kind === 'markdown') {
        extractedText = new TextDecoder('utf-8', { fatal: true }).decode(input.content).trim();
      } else {
        const extraction = await this.documentExtractor.extract(kind, input.content);
        extractedText = extraction.text.trim();
        warnings = extraction.warnings;
      }
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Document text extraction failed.',
      );
    }
    if (!extractedText) {
      throw new BadRequestException(
        kind === 'pdf'
          ? 'PDF contains no extractable text; scanned PDF OCR is not supported in V1.'
          : 'Document contains no extractable text.',
      );
    }
    if (extractedText.length > 1_000_000) {
      throw new BadRequestException('Extracted document text exceeds the V1 text limit.');
    }
    const id = crypto.randomUUID();
    const extension = extname(input.filename)
      .toLowerCase()
      .replace(/[^.a-z0-9]/gu, '');
    const storageKey = `materials/${id}/original${extension}`;
    await this.storage.write(storageKey, input.content);
    const original: NewStoredFile = {
      fileRole: 'original',
      storageKey,
      originalFilename: basename(input.filename).slice(0, 255),
      mimeType: input.mimeType || 'application/octet-stream',
      byteSize: input.content.byteLength,
      sha256: sha256(input.content),
      expiresAt: null,
    };
    return this.persist(
      user.id,
      {
        id,
        title: cleanTitle(input.title || basename(input.filename, extname(input.filename))),
        kind,
        sourceText: kind === 'plain_text' || kind === 'markdown' ? extractedText : null,
        extractedText,
        notes: input.notes?.trim().slice(0, 20_000) ?? '',
        sourceUrl: null,
        sourceTitle: '',
        sourceSiteName: '',
        fetchedAt: null,
        termsReviewStatus: 'not_applicable',
        extractionWarnings: warnings.slice(0, 50).map((warning) => warning.slice(0, 500)),
        files: [original],
      },
      [storageKey],
    );
  }

  async list(): Promise<readonly Material[]> {
    const user = await this.identityService.getCurrentUser();
    return this.repository.list(user.id);
  }

  async get(materialId: string): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    const material = await this.repository.get(user.id, materialId);
    if (!material) throw new NotFoundException('Material not found.');
    return material;
  }

  async update(materialId: string, input: UpdateMaterial): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.update(user.id, materialId, input));
  }

  async linkProject(materialId: string, projectId: string): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.linkProject(user.id, materialId, projectId));
  }

  async unlinkProject(materialId: string, projectId: string): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(
      await this.repository.unlinkProject(user.id, materialId, projectId),
    );
  }

  async linkTopic(materialId: string, topicId: string): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.linkTopic(user.id, materialId, topicId));
  }

  async unlinkTopic(materialId: string, topicId: string): Promise<Material> {
    const user = await this.identityService.getCurrentUser();
    return this.resolveMutation(await this.repository.unlinkTopic(user.id, materialId, topicId));
  }

  async onModuleDestroy(): Promise<void> {
    await this.repository.close?.();
  }
}
