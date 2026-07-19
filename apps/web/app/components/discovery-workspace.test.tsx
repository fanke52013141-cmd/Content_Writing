import type { ExternalSourcePolicy } from '@content-writing/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DiscoveryWorkspace } from './discovery-workspace';

const timestamp = '2026-07-18T00:00:00.000Z';
const policies: ExternalSourcePolicy[] = [
  {
    id: '019f754a-c6d8-7fa2-a3c8-000000000001',
    kind: 'hot_topic',
    sourceKey: 'douyin',
    displayName: '抖音',
    referenceUrl: 'https://www.douyin.com/hot',
    enabled: false,
    termsReviewStatus: 'pending',
    reviewNote: '',
    reviewedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: '019f754a-c6d8-7fa2-a3c8-000000000002',
    kind: 'search',
    sourceKey: 'searxng',
    displayName: 'SearXNG 外部搜索',
    referenceUrl: 'https://docs.searxng.org/',
    enabled: true,
    termsReviewStatus: 'approved',
    reviewNote: '',
    reviewedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function response(body: unknown, ok = true): Pick<Response, 'ok' | 'json'> {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('DiscoveryWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('requires source approval, then refreshes a hot topic and runs search', async () => {
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/discovery/sources') && !init?.method)
        return Promise.resolve(response(policies));
      if (input.endsWith('/discovery/sources/019f754a-c6d8-7fa2-a3c8-000000000001')) {
        return Promise.resolve(
          response({
            ...policies[0],
            enabled: true,
            termsReviewStatus: 'approved',
            reviewedAt: timestamp,
          }),
        );
      }
      if (input.includes('/discovery/hot-topics?')) {
        return Promise.resolve(
          response([
            {
              id: 'hot-1',
              source: 'douyin',
              externalId: '1',
              title: '热点',
              url: 'https://example.com/hot',
              observedAt: timestamp,
              rank: 1,
              providerKey: 'test',
              fetchedAt: timestamp,
            },
          ]),
        );
      }
      if (input.endsWith('/discovery/search')) {
        return Promise.resolve(
          response({
            id: 'run-1',
            query: '写作',
            providerKey: 'searxng',
            createdAt: timestamp,
            results: [],
          }),
        );
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DiscoveryWorkspace />);

    expect(await screen.findByText('待条款审查')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '审查通过' }));
    await waitFor(() => expect(screen.getByText('抖音 已批准，可抓取。')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('刷新热点'));
    expect(await screen.findByText('热点')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('外部搜索关键词'), { target: { value: '写作' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
    await waitFor(() => expect(screen.getByText('搜索结果已保存到本地历史。')).toBeInTheDocument());
  });
});
