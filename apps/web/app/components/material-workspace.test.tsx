import type { ContentProject, Material, Topic } from '@content-writing/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MaterialWorkspace } from './material-workspace';

const timestamp = '2026-07-18T00:00:00.000Z';
const project: ContentProject = {
  id: '019f754a-c6d8-7fa2-a3c8-333333333333',
  title: '创作项目',
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
  accountId: null,
  title: '核心选题',
  angle: '',
  targetAudience: '',
  contentGoal: '',
  keywords: [],
  source: 'manual',
  sourceGenerationId: null,
  sourceHotTopicId: null,
  status: 'active',
  projectLinks: [],
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
};
const material: Material = {
  id: '019f754a-c6d8-7fa2-a3c8-555555555555',
  title: '研究笔记',
  kind: 'markdown',
  extractedText: '# 研究判断\n\n这是正文。',
  notes: '',
  sourceUrl: null,
  sourceTitle: '',
  sourceSiteName: '',
  fetchedAt: null,
  termsReviewStatus: 'not_applicable',
  originalFilename: '',
  mimeType: '',
  byteSize: null,
  sha256: null,
  fileAvailable: false,
  rawSnapshotExpiresAt: null,
  extractionWarnings: [],
  status: 'active',
  projectLinks: [],
  topicLinks: [],
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
};

function response(body: unknown, ok = true): Pick<Response, 'ok' | 'json'> {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('MaterialWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates Markdown text without a file upload', async () => {
    let materials: readonly Material[] = [];
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/projects')) return Promise.resolve(response([project]));
      if (input.endsWith('/api/v1/topics')) return Promise.resolve(response([topic]));
      if (input.endsWith('/api/v1/materials/text') && init?.method === 'POST') {
        materials = [material];
        return Promise.resolve(response(material));
      }
      if (input.endsWith('/api/v1/materials')) return Promise.resolve(response(materials));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MaterialWorkspace />);

    await screen.findByText('还没有素材');
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: material.title } });
    fireEvent.change(screen.getByLabelText('内容'), { target: { value: material.extractedText } });
    fireEvent.click(screen.getByRole('button', { name: '保存素材' }));

    await screen.findByRole('heading', { name: material.title });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/materials\/text$/u),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('markdown') as string,
      }),
    );
  });

  it('uploads a local file through multipart FormData', async () => {
    let materials: readonly Material[] = [];
    let uploadedBody: BodyInit | null | undefined;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/projects')) return Promise.resolve(response([project]));
      if (input.endsWith('/api/v1/topics')) return Promise.resolve(response([topic]));
      if (input.endsWith('/api/v1/materials/file')) {
        uploadedBody = init?.body;
        materials = [{ ...material, originalFilename: 'notes.md', fileAvailable: true }];
        return Promise.resolve(response(materials[0]));
      }
      if (input.endsWith('/api/v1/materials')) return Promise.resolve(response(materials));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<MaterialWorkspace />);

    fireEvent.click(await screen.findByRole('tab', { name: '上传文件' }));
    const file = new File(['# local notes'], 'notes.md', { type: 'text/markdown' });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存素材' }));

    await screen.findByRole('heading', { name: material.title });
    expect(uploadedBody).toBeInstanceOf(FormData);
  });

  it('links a material to both contexts and archives it explicitly', async () => {
    let current = material;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/projects')) return Promise.resolve(response([project]));
      if (input.endsWith('/api/v1/topics')) return Promise.resolve(response([topic]));
      if (input.endsWith(`/api/v1/materials/${material.id}`) && init?.method === 'PATCH') {
        if (typeof init.body !== 'string') throw new Error('Expected a JSON body.');
        const patch = JSON.parse(init.body) as { status?: 'archived' };
        current = { ...current, status: patch.status ?? current.status, archivedAt: timestamp };
        return Promise.resolve(response(current));
      }
      if (input.endsWith(`/api/v1/materials/${material.id}/projects/${project.id}`)) {
        current = {
          ...current,
          projectLinks:
            init?.method === 'PUT' ? [{ projectId: project.id, projectTitle: project.title }] : [],
        };
        return Promise.resolve(response(current));
      }
      if (input.endsWith(`/api/v1/materials/${material.id}/topics/${topic.id}`)) {
        current = {
          ...current,
          topicLinks:
            init?.method === 'PUT' ? [{ topicId: topic.id, topicTitle: topic.title }] : [],
        };
        return Promise.resolve(response(current));
      }
      if (input.endsWith('/api/v1/materials')) return Promise.resolve(response([current]));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<MaterialWorkspace />);

    const projectSelect = await screen.findByLabelText(`为 ${material.title} 选择项目`);
    fireEvent.change(projectSelect, { target: { value: project.id } });
    fireEvent.click(screen.getAllByRole('button', { name: '关联项目' })[0]!);
    const topicSelect = await screen.findByLabelText(`为 ${material.title} 选择选题`);
    fireEvent.change(topicSelect, { target: { value: topic.id } });
    fireEvent.click(screen.getByRole('button', { name: '关联选题' }));

    await screen.findByText('核心选题');
    fireEvent.click(screen.getByRole('button', { name: '归档' }));
    await waitFor(() => expect(screen.getByText('已归档')).toBeInTheDocument());
  });
});
