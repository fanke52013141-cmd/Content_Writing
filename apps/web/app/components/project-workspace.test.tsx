import type { Account, ContentProject } from '@content-writing/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectWorkspace } from './project-workspace';

const timestamp = '2026-07-18T00:00:00.000Z';
const account: Account = {
  id: '019f754a-c6d8-7fa2-a3c8-111111111111',
  name: '墨流实验室',
  description: '',
  status: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
};
const project: ContentProject = {
  id: '019f754a-c6d8-7fa2-a3c8-333333333333',
  title: '第一篇文章',
  creationOrigin: 'idea',
  originNote: '自己的想法',
  status: 'active',
  accountLinks: [{ accountId: account.id, accountName: account.name, isPrimary: true }],
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: null,
  archivedAt: null,
};

function response(body: unknown, ok = true): Pick<Response, 'ok' | 'json'> {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('ProjectWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a project from an explicit origin without asking for a workflow step', async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/accounts')) return Promise.resolve(response([account]));
      if (input.endsWith('/api/v1/projects') && init?.method === 'POST') {
        created = true;
        return Promise.resolve(response(project));
      }
      if (input.endsWith('/api/v1/projects')) {
        return Promise.resolve(response(created ? [project] : []));
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ProjectWorkspace />);

    await screen.findByText('还没有创作项目');
    fireEvent.change(screen.getByLabelText('项目标题'), { target: { value: '第一篇文章' } });
    fireEvent.change(screen.getByLabelText('从哪里开始'), { target: { value: 'idea' } });
    fireEvent.click(screen.getByRole('button', { name: '创建项目' }));

    await screen.findByRole('heading', { name: '第一篇文章' });
    expect(screen.queryByLabelText(/步骤/u)).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/projects$/u),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"creationOrigin":"idea"') as string,
      }),
    );
  });

  it('marks completion only after the user clicks the explicit action', async () => {
    let completed = false;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/accounts')) return Promise.resolve(response([account]));
      if (input.endsWith(`/api/v1/projects/${project.id}`) && init?.method === 'PATCH') {
        completed = true;
        return Promise.resolve(
          response({ ...project, status: 'completed', completedAt: timestamp }),
        );
      }
      if (input.endsWith('/api/v1/projects')) {
        return Promise.resolve(
          response(
            completed ? [{ ...project, status: 'completed', completedAt: timestamp }] : [project],
          ),
        );
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ProjectWorkspace />);

    const complete = await screen.findByRole('button', { name: '标记完成' });
    expect(screen.getByText('创作中')).toBeInTheDocument();
    fireEvent.click(complete);

    await waitFor(() => expect(screen.getByText('已完成')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/api/v1/projects/${project.id}$`, 'u')),
      expect.objectContaining({ method: 'PATCH', body: '{"status":"completed"}' }),
    );
  });
});
