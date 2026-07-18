import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OutlineWorkspace } from './outline-workspace';

const outline = {
  id: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
  projectId: null,
  topicId: null,
  title: '初始框架',
  summary: '',
  sections: [{ heading: '开场', purpose: '', keyPoints: [], evidenceMaterialIds: [] }],
  source: 'manual',
  sourceGenerationId: null,
  status: 'active',
  createdAt: '2026-07-19T00:00:00.000Z',
  updatedAt: '2026-07-19T00:00:00.000Z',
  archivedAt: null,
};

describe('OutlineWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a structured outline from line-based section titles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(outline) });
    vi.stubGlobal('fetch', fetchMock);
    render(<OutlineWorkspace />);
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '新框架' } });
    fireEvent.submit(screen.getByRole('button', { name: '保存框架' }));
    await waitFor(() => expect(screen.getByText('框架已创建')).toBeInTheDocument());
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(typeof request?.body).toBe('string');
    const requestBody = JSON.parse(request?.body as string) as { sections: unknown[] };
    expect(requestBody.sections).toHaveLength(3);
  });

  it('loads an outline and sends lifecycle-only archive updates', async () => {
    const archived = { ...outline, status: 'archived', archivedAt: '2026-07-19T01:00:00.000Z' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([outline]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(archived) });
    vi.stubGlobal('fetch', fetchMock);
    render(<OutlineWorkspace />);
    await waitFor(() => expect(screen.getByText('初始框架')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '初始框架 1 个章节 · 进行中' }));
    fireEvent.click(screen.getByRole('button', { name: '归档框架' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
    expect(typeof request?.body).toBe('string');
    expect(JSON.parse(request?.body as string) as unknown).toEqual({
      status: 'archived',
    });
  });
});
