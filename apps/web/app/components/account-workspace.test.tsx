import type { Account, AccountProfileVersion } from '@content-writing/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountWorkspace } from './account-workspace';

const timestamp = '2026-07-18T00:00:00.000Z';
const account: Account = {
  id: '019f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
  name: '墨流实验室',
  description: '个人内容账号',
  status: 'active',
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
};
const draft: AccountProfileVersion = {
  id: '029f754a-c6d8-7fa2-a3c8-1f1c2e2837a7',
  accountId: account.id,
  versionNumber: 1,
  status: 'draft',
  source: 'manual',
  positioningStatement: '帮助个人创作者稳定写作',
  targetAudience: '独立公众号创作者',
  valueProposition: '可执行的写作方法',
  contentPillars: ['选题', '写作'],
  toneKeywords: ['清晰'],
  writingStyle: '先结论后论据',
  contentBoundaries: '不虚构事实',
  versionNote: '首版定位',
  sourceGenerationId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  activatedAt: null,
  supersededAt: null,
};

function response(body: unknown, ok = true): Pick<Response, 'ok' | 'json'> {
  return { ok, json: vi.fn().mockResolvedValue(body) };
}

describe('AccountWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates the first account and keeps the profile area empty until a draft exists', async () => {
    let created = false;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/accounts') && init?.method === 'POST') {
        created = true;
        return Promise.resolve(response(account));
      }
      if (input.endsWith('/api/v1/accounts')) {
        return Promise.resolve(response(created ? [account] : []));
      }
      if (input.endsWith('/profile-versions')) return Promise.resolve(response([]));
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountWorkspace />);

    await waitFor(() => expect(screen.getByText('先添加一个内容账号')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('新账号名称'), {
      target: { value: '墨流实验室' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加账号' }));

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: '创建定位草稿' })).toBeInTheDocument(),
    );
    expect(screen.getByText('先保存第一份定位草稿。')).toBeInTheDocument();
  });

  it('shows candidate acceptance as an explicit action and refreshes the active version', async () => {
    let activated = false;
    const fetchMock = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (input.endsWith('/api/v1/accounts')) return Promise.resolve(response([account]));
      if (input.endsWith('/activate') && init?.method === 'POST') {
        activated = true;
        return Promise.resolve(response({ ...draft, status: 'active', activatedAt: timestamp }));
      }
      if (input.endsWith('/profile-versions')) {
        return Promise.resolve(
          response(activated ? [{ ...draft, status: 'active', activatedAt: timestamp }] : [draft]),
        );
      }
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AccountWorkspace />);

    const accept = await screen.findByRole('button', { name: '接受并设为当前定位' });
    fireEvent.click(accept);

    await waitFor(() => expect(screen.getByText('当前启用')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/activate$/u),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
