import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArticleWorkspace } from './article-workspace';

const article = {
  id: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
  projectId: null,
  topicId: null,
  outlineId: null,
  title: '文章初稿',
  status: 'active',
  currentVersionId: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a8',
  currentVersion: {
    id: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a8',
    articleId: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
    versionNumber: 1,
    title: '文章初稿',
    body: '正文',
    kind: 'manual',
    status: 'current',
    sourceGenerationId: null,
    sourceReviewId: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    acceptedAt: '2026-07-19T00:00:00.000Z',
  },
  versions: [],
  reviews: [],
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  archivedAt: null,
};

describe('ArticleWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates an article and exposes the immutable candidate action', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ...article, versions: [article.currentVersion] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<ArticleWorkspace />);
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '文章初稿' } });
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '正文' } });
    fireEvent.submit(screen.getByRole('button', { name: '保存为 Current' }));
    await waitFor(() => expect(screen.getByText('文章已创建')).toBeInTheDocument());
    expect(fetchMock.mock.calls[2]?.[0]).toMatch(/\/articles$/u);
  });

  it('sends review input for the selected Current version', async () => {
    const loaded = { ...article, versions: [article.currentVersion] };
    const reviewed = {
      ...loaded,
      reviews: [
        {
          id: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a9',
          articleId: loaded.id,
          versionId: loaded.currentVersionId,
          capabilityKey: 'review.readability',
          verdict: 'pass',
          summary: '结构清晰',
          findings: [],
          createdAt: '2026-07-19T00:00:00.000Z',
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([loaded]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(reviewed) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ArticleWorkspace />);
    await waitFor(() => expect(screen.getByText('文章初稿')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /文章初稿 1 个版本/u }));
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: '结构清晰' } });
    fireEvent.submit(screen.getByRole('button', { name: /保存评审/u }));
    await waitFor(() => expect(screen.getByText('评审已记录')).toBeInTheDocument());
    const request = fetchMock.mock.calls[2]?.[1] as RequestInit | undefined;
    expect(JSON.parse(request?.body as string)).toMatchObject({
      versionId: loaded.currentVersionId,
    });
  });
});
