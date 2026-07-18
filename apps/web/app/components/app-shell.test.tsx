import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './app-shell';

describe('AppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the approved creation navigation without publishing management', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<AppShell />);

    expect(screen.getByRole('heading', { name: '今天想写点什么？' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '账号定位' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '热点中心' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Prompt 管理' })).toBeInTheDocument();
    expect(screen.queryByText('公众号管理')).not.toBeInTheDocument();
    expect(screen.queryByText('发布记录')).not.toBeInTheDocument();
    expect(screen.queryByText('发布文章')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('本地服务未连接')).toBeInTheDocument());
  });

  it('uses a single highest-priority creation action', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<AppShell />);

    expect(screen.getAllByRole('button', { name: '新建创作' })).toHaveLength(1);
    await waitFor(() => expect(screen.getByText('本地服务正常')).toBeInTheDocument());
  });
});
