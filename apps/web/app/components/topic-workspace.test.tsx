import type { Account, ContentProject, Topic } from '@content-writing/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TopicWorkspace } from './topic-workspace';

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
  title: '本地创作实践',
  creationOrigin: 'topic',
  originNote: '',
  status: 'active',
  accountLinks: [],
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: null,
  archivedAt: null,
};
const topic: Topic = {
  id: '019f754a-c6d8-7fa2-a3c8-444444444444',
  accountId: account.id,
  title: '如何建立稳定的选题系统',
  angle: '从复用资产切入',
  targetAudience: '个人创作者',
  contentGoal: '开始实践',
  keywords: ['选题'],
  source: 'manual',
  sourceGenerationId: null,
  status: 'active',
  projectLinks: [],
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
};

function response(body: unknown, ok = true): Pick<Response, 'ok' | 'json'> {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('TopicWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a reusable topic without requiring a project', async () => {
    let topics: readonly Topic[] = [];
    let postedBody = '';
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/accounts')) return Promise.resolve(response([account]));
      if (input.endsWith('/api/v1/projects')) return Promise.resolve(response([project]));
      if (input.endsWith('/api/v1/topics') && init?.method === 'POST') {
        if (typeof init.body !== 'string') throw new Error('Expected a JSON request body.');
        postedBody = init.body;
        topics = [topic];
        return Promise.resolve(response(topic));
      }
      if (input.endsWith('/api/v1/topics')) return Promise.resolve(response(topics));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<TopicWorkspace />);

    await screen.findByText('还没有选题');
    fireEvent.change(screen.getByLabelText('选题标题'), {
      target: { value: '如何建立稳定的选题系统' },
    });
    fireEvent.change(screen.getByLabelText('关键词'), { target: { value: '选题，内容系统' } });
    fireEvent.click(screen.getByRole('button', { name: '保存选题' }));

    await screen.findByRole('heading', { name: topic.title });
    expect(postedBody).toContain('"keywords":["选题","内容系统"]');
    expect(postedBody).not.toContain('projectId');
  });

  it('edits a manual topic in place', async () => {
    let currentTopic = topic;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/accounts')) return Promise.resolve(response([account]));
      if (input.endsWith('/api/v1/projects')) return Promise.resolve(response([project]));
      if (input.endsWith(`/api/v1/topics/${topic.id}`) && init?.method === 'PATCH') {
        if (typeof init.body !== 'string') throw new Error('Expected a JSON request body.');
        const inputBody = JSON.parse(init.body) as Pick<Topic, 'title' | 'angle'>;
        currentTopic = { ...currentTopic, ...inputBody };
        return Promise.resolve(response(currentTopic));
      }
      if (input.endsWith('/api/v1/topics')) return Promise.resolve(response([currentTopic]));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<TopicWorkspace />);

    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('编辑选题标题'), {
      target: { value: '选题系统的三个关键动作' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await screen.findByRole('heading', { name: '选题系统的三个关键动作' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/api/v1/topics/${topic.id}$`, 'u')),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('links and unlinks a project while preserving the topic', async () => {
    let currentTopic = topic;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      const relationPath = `/api/v1/topics/${topic.id}/projects/${project.id}`;
      if (input.endsWith(relationPath) && init?.method === 'PUT') {
        currentTopic = {
          ...currentTopic,
          projectLinks: [{ projectId: project.id, projectTitle: project.title, isPrimary: true }],
        };
        return Promise.resolve(response(currentTopic));
      }
      if (input.endsWith(relationPath) && init?.method === 'DELETE') {
        currentTopic = { ...currentTopic, projectLinks: [] };
        return Promise.resolve(response(currentTopic));
      }
      if (input.endsWith('/api/v1/accounts')) return Promise.resolve(response([account]));
      if (input.endsWith('/api/v1/projects')) return Promise.resolve(response([project]));
      if (input.endsWith('/api/v1/topics')) return Promise.resolve(response([currentTopic]));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<TopicWorkspace />);

    const projectSelect = await screen.findByLabelText(`为 ${topic.title} 选择项目`);
    fireEvent.change(projectSelect, { target: { value: project.id } });
    fireEvent.click(screen.getByRole('button', { name: '关联项目' }));

    const unlink = await screen.findByRole('button', { name: `解除与 ${project.title} 的关联` });
    expect(screen.getByText('Primary')).toBeInTheDocument();
    fireEvent.click(unlink);

    await waitFor(() => expect(screen.getByText('未关联项目')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: topic.title })).toBeInTheDocument();
  });
});
