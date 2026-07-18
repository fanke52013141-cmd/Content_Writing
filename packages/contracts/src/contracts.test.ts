import { describe, expect, it } from 'vitest';

import {
  accountProfileVersionSchema,
  createAccountProfileDraftSchema,
  createAccountSchema,
  createContentProjectSchema,
  createTopicSchema,
  apiErrorSchema,
  generationJobSchema,
  createGenerationSchema,
  hotTopicProviderItemSchema,
  hotTopicSourceSchema,
  localUserSchema,
  modelRequestSchema,
  setLocalPinSchema,
  updateLocalUserSchema,
  updateContentProjectSchema,
  updateTopicSchema,
  createTextMaterialSchema,
  createUrlMaterialSchema,
  updateMaterialSchema,
  outlineSchema,
  updateOutlineSchema,
} from './index.js';

describe('shared contracts', () => {
  it('accepts a valid model request and supplies the default temperature', () => {
    const parsed = modelRequestSchema.parse({
      generationId: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
      capabilityKey: 'article.write',
      systemPrompt: 'Keep facts traceable.',
      userPrompt: 'Draft an article.',
      model: 'mock-writer',
    });

    expect(parsed.temperature).toBe(0.7);
  });

  it('rejects model temperatures outside the portable provider range', () => {
    expect(() =>
      modelRequestSchema.parse({
        generationId: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
        capabilityKey: 'article.write',
        systemPrompt: '',
        userPrompt: 'Draft an article.',
        model: 'mock-writer',
        temperature: 2.1,
      }),
    ).toThrow();
  });

  it('requires queue and request generation IDs to match', () => {
    expect(
      generationJobSchema.safeParse({
        generationId: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
        providerKey: 'mock',
        request: {
          ...modelRequestSchema.parse({
            generationId: '029f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
            capabilityKey: 'article.write',
            systemPrompt: 'Prompt',
            userPrompt: 'Input',
            model: 'mock-writer',
          }),
        },
      }).success,
    ).toBe(false);
  });

  it('applies safe mock defaults to generation commands', () => {
    expect(
      createGenerationSchema.parse({
        capabilityKey: 'article.write',
        input: { topic: '本地 AI 工具' },
      }),
    ).toEqual({
      capabilityKey: 'article.write',
      providerKey: 'mock',
      model: 'mock-writer',
      input: { topic: '本地 AI 工具' },
      temperature: 0.7,
    });
  });

  it('contains exactly the ten approved hot-topic sources', () => {
    expect(hotTopicSourceSchema.options).toEqual([
      'douyin',
      'kuaishou',
      'weibo',
      'zhihu',
      'baidu',
      'toutiao',
      'thepaper',
      '36kr',
      'huxiu',
      'bilibili',
    ]);
    expect(hotTopicSourceSchema.safeParse('wechat').success).toBe(false);
  });

  it('requires normalized hot-topic URLs and observation timestamps', () => {
    expect(
      hotTopicProviderItemSchema.safeParse({
        externalId: 'item-1',
        source: 'weibo',
        title: 'Example topic',
        url: 'not-a-url',
        observedAt: 'yesterday',
      }).success,
    ).toBe(false);
  });

  it('keeps API errors machine-readable and traceable', () => {
    expect(
      apiErrorSchema.parse({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid input',
          traceId: 'trace-1',
        },
      }).error.code,
    ).toBe('VALIDATION_FAILED');
  });

  it('trims local display names and rejects unknown fields', () => {
    expect(updateLocalUserSchema.parse({ displayName: '  创作者  ' })).toEqual({
      displayName: '创作者',
    });
    expect(updateLocalUserSchema.safeParse({ displayName: '创作者', role: 'admin' }).success).toBe(
      false,
    );
  });

  it('accepts numeric local PINs without exposing hashes in the public user contract', () => {
    expect(setLocalPinSchema.safeParse({ pin: '123456' }).success).toBe(true);
    expect(setLocalPinSchema.safeParse({ pin: '12ab' }).success).toBe(false);
    expect(
      localUserSchema.safeParse({
        id: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
        displayName: '本地创作者',
        pinEnabled: true,
        pinHash: 'must-not-be-public',
        createdAt: '2026-07-18T00:00:00.000Z',
        updatedAt: '2026-07-18T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      Object.keys(
        localUserSchema.parse({
          id: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
          displayName: '本地创作者',
          pinEnabled: true,
          pinHash: 'must-not-be-public',
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:00:00.000Z',
        }),
      ),
    ).not.toContain('pinHash');
  });

  it('normalizes account creation and rejects unknown management fields', () => {
    expect(createAccountSchema.parse({ name: '  我的账号  ' })).toEqual({
      name: '我的账号',
      description: '',
    });
    expect(
      createAccountSchema.safeParse({ name: '账号', ownerUserId: crypto.randomUUID() }).success,
    ).toBe(false);
  });

  it('supports structured profile drafts without allowing lifecycle fields from clients', () => {
    const draft = createAccountProfileDraftSchema.parse({
      positioningStatement: '帮助个人创作者稳定输出',
      targetAudience: '独立运营公众号的个人创作者',
      valueProposition: '可直接执行的内容方法',
      contentPillars: ['选题', '写作'],
      toneKeywords: ['克制', '清晰'],
      writingStyle: '短段落，先结论后论据',
      contentBoundaries: '不虚构数据',
    });

    expect(draft.versionNote).toBe('');
    expect(createAccountProfileDraftSchema.safeParse({ ...draft, status: 'active' }).success).toBe(
      false,
    );
  });

  it('keeps profile source and activation metadata explicit in output contracts', () => {
    const timestamp = '2026-07-18T00:00:00.000Z';
    expect(
      accountProfileVersionSchema.parse({
        id: crypto.randomUUID(),
        accountId: crypto.randomUUID(),
        versionNumber: 1,
        status: 'draft',
        source: 'manual',
        positioningStatement: '',
        targetAudience: '',
        valueProposition: '',
        contentPillars: [],
        toneKeywords: [],
        writingStyle: '',
        contentBoundaries: '',
        versionNote: '',
        sourceGenerationId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        activatedAt: null,
        supersededAt: null,
      }).source,
    ).toBe('manual');
  });

  it('requires an explicit project creation origin without imposing workflow steps', () => {
    expect(
      createContentProjectSchema.parse({ title: '第一篇文章', creationOrigin: 'blank' }),
    ).toEqual({
      title: '第一篇文章',
      creationOrigin: 'blank',
      originNote: '',
    });
    expect(createContentProjectSchema.safeParse({ title: '缺少起点' }).success).toBe(false);
  });

  it('accepts user-controlled project completion and rejects implicit workflow fields', () => {
    expect(updateContentProjectSchema.parse({ status: 'completed' })).toEqual({
      status: 'completed',
    });
    expect(updateContentProjectSchema.safeParse({ currentStep: 3 }).success).toBe(false);
  });

  it('creates an independent manual topic without requiring a project', () => {
    expect(createTopicSchema.parse({ title: '  AI 本地工具为什么值得做  ' })).toEqual({
      title: 'AI 本地工具为什么值得做',
      angle: '',
      targetAudience: '',
      contentGoal: '',
      keywords: [],
    });
  });

  it('keeps topic lifecycle and AI provenance outside client-controlled creation fields', () => {
    expect(createTopicSchema.safeParse({ title: '选题', source: 'ai' }).success).toBe(false);
    expect(updateTopicSchema.parse({ status: 'archived' })).toEqual({ status: 'archived' });
  });

  it('accepts only the approved inline material kinds and keeps provenance server-controlled', () => {
    expect(
      createTextMaterialSchema.parse({
        title: '创作笔记',
        kind: 'markdown',
        content: '# 一个判断',
      }),
    ).toEqual({
      title: '创作笔记',
      kind: 'markdown',
      content: '# 一个判断',
      notes: '',
    });
    expect(
      createTextMaterialSchema.safeParse({
        title: '伪造来源',
        kind: 'pdf',
        content: '不是 PDF',
        sha256: 'forged',
      }).success,
    ).toBe(false);
  });

  it('allows HTTP(S) URL import and explicit terms review without accepting local file URLs', () => {
    expect(createUrlMaterialSchema.parse({ url: 'https://example.com/article' })).toEqual({
      url: 'https://example.com/article',
      notes: '',
    });
    expect(createUrlMaterialSchema.safeParse({ url: 'file:///C:/secret.txt' }).success).toBe(false);
    expect(updateMaterialSchema.parse({ termsReviewStatus: 'approved' })).toEqual({
      termsReviewStatus: 'approved',
    });
  });

  it('validates structured outline sections and lifecycle updates', () => {
    const outline = outlineSchema.parse({
      id: crypto.randomUUID(),
      projectId: null,
      topicId: null,
      title: '框架',
      summary: '',
      sections: [
        { heading: '开场', purpose: '提出问题', keyPoints: ['事实'], evidenceMaterialIds: [] },
      ],
      source: 'manual',
      sourceGenerationId: null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    });
    expect(outline.sections).toHaveLength(1);
    expect(updateOutlineSchema.parse({ status: 'archived' })).toEqual({ status: 'archived' });
  });
});
