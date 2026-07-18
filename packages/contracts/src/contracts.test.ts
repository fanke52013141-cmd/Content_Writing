import { describe, expect, it } from 'vitest';

import {
  accountProfileVersionSchema,
  createAccountProfileDraftSchema,
  createAccountSchema,
  apiErrorSchema,
  generationJobSchema,
  createGenerationSchema,
  hotTopicProviderItemSchema,
  hotTopicSourceSchema,
  localUserSchema,
  modelRequestSchema,
  setLocalPinSchema,
  updateLocalUserSchema,
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
});
