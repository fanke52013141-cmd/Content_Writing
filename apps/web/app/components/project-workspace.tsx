'use client';

import type {
  Account,
  ContentProject,
  ProjectCreationOrigin,
  ProjectStatus,
} from '@content-writing/contracts';
import {
  Archive,
  CircleAlert,
  Link2,
  Plus,
  RotateCcw,
  Unlink,
  type LucideIcon,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3100';

const origins: readonly {
  value: ProjectCreationOrigin;
  label: string;
  description: string;
}[] = [
  { value: 'idea', label: '一个想法', description: '记录自己的判断或灵感' },
  { value: 'hot_topic', label: '一个热点', description: '从内容机会切入' },
  { value: 'topic', label: '已有选题', description: '继续推进选题库内容' },
  { value: 'existing_article', label: '已有文章', description: '评审或改写已有正文' },
  { value: 'blank', label: '空白项目', description: '暂不绑定任何起点' },
];

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new Error('本地服务未连接，请先启动平台。');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? '本地服务请求失败');
  }
  return response.json() as Promise<T>;
}

function statusLabel(status: ProjectStatus): string {
  if (status === 'completed') return '已完成';
  if (status === 'archived') return '已归档';
  return '创作中';
}

export function ProjectWorkspace() {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [projects, setProjects] = useState<readonly ContentProject[]>([]);
  const [title, setTitle] = useState('');
  const [creationOrigin, setCreationOrigin] = useState<ProjectCreationOrigin>('idea');
  const [originNote, setOriginNote] = useState('');
  const [primaryAccountId, setPrimaryAccountId] = useState('');
  const [linkSelections, setLinkSelections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (): Promise<void> => {
    const [nextAccounts, nextProjects] = await Promise.all([
      request<readonly Account[]>('/api/v1/accounts'),
      request<readonly ContentProject[]>('/api/v1/projects'),
    ]);
    setAccounts(nextAccounts.filter((account) => account.status !== 'archived'));
    setProjects(nextProjects);
  };

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '无法读取创作项目');
    });
  }, []);

  const createProject = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request<ContentProject>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
          title,
          creationOrigin,
          originNote,
          ...(primaryAccountId ? { primaryAccountId } : {}),
        }),
      });
      setTitle('');
      setOriginNote('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创作项目创建失败');
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (projectId: string, status: ProjectStatus): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await request<ContentProject>(`/api/v1/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目状态更新失败');
    } finally {
      setBusy(false);
    }
  };

  const linkAccount = async (projectId: string): Promise<void> => {
    const accountId = linkSelections[projectId];
    if (!accountId) return;
    setBusy(true);
    setError('');
    try {
      await request<ContentProject>(`/api/v1/projects/${projectId}/accounts`, {
        method: 'PUT',
        body: JSON.stringify({ accountId, isPrimary: true }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '账号关联失败');
    } finally {
      setBusy(false);
    }
  };

  const unlinkAccount = async (projectId: string, accountId: string): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await request<ContentProject>(`/api/v1/projects/${projectId}/accounts/${accountId}`, {
        method: 'DELETE',
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '解除关联失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="project-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">一次创作，一个工作空间</p>
          <h1>创作项目</h1>
          <p>选择从哪里开始，然后自由使用选题、素材、框架、文章和评审；系统不会强制推进步骤。</p>
        </div>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      )}

      <section className="project-create" aria-labelledby="project-create-heading">
        <div className="section-heading">
          <div>
            <h2 id="project-create-heading">新建创作项目</h2>
            <span>Creation Origin 只记录起点，不决定后续步骤</span>
          </div>
        </div>
        <form className="project-create__form" onSubmit={(event) => void createProject(event)}>
          <label>
            项目标题
            <input
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="这篇内容暂定写什么"
              required
              value={title}
            />
          </label>
          <label>
            从哪里开始
            <select
              onChange={(event) => setCreationOrigin(event.target.value as ProjectCreationOrigin)}
              value={creationOrigin}
            >
              {origins.map((origin) => (
                <option key={origin.value} value={origin.value}>
                  {origin.label} · {origin.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            起点说明
            <textarea
              maxLength={4000}
              onChange={(event) => setOriginNote(event.target.value)}
              placeholder="记录最初的想法、目标或已有内容"
              value={originNote}
            />
          </label>
          <label>
            主要账号（可选）
            <select
              onChange={(event) => setPrimaryAccountId(event.target.value)}
              value={primaryAccountId}
            >
              <option value="">暂不关联</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            <Plus size={16} /> 创建项目
          </button>
        </form>
      </section>

      <section aria-labelledby="project-list-heading">
        <div className="section-heading">
          <h2 id="project-list-heading">全部项目</h2>
          <span>{projects.length} 个项目</span>
        </div>
        {projects.length === 0 ? (
          <div className="empty-state">
            <Plus size={28} />
            <strong>还没有创作项目</strong>
            <p>从一个想法、热点、已有选题或空白项目开始。</p>
          </div>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <ProjectCard
                accounts={accounts}
                busy={busy}
                key={project.id}
                linkSelection={linkSelections[project.id] ?? ''}
                onLink={(projectId) => void linkAccount(projectId)}
                onLinkSelection={(projectId, accountId) =>
                  setLinkSelections((current) => ({ ...current, [projectId]: accountId }))
                }
                onStatus={(projectId, status) => void updateStatus(projectId, status)}
                onUnlink={(projectId, accountId) => void unlinkAccount(projectId, accountId)}
                project={project}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProjectCard({
  accounts,
  busy,
  linkSelection,
  onLink,
  onLinkSelection,
  onStatus,
  onUnlink,
  project,
}: {
  accounts: readonly Account[];
  busy: boolean;
  linkSelection: string;
  onLink: (projectId: string) => void;
  onLinkSelection: (projectId: string, accountId: string) => void;
  onStatus: (projectId: string, status: ProjectStatus) => void;
  onUnlink: (projectId: string, accountId: string) => void;
  project: ContentProject;
}) {
  const primaryAccount = project.accountLinks.find((link) => link.isPrimary);
  const availableAccounts = accounts.filter(
    (account) => !project.accountLinks.some((link) => link.accountId === account.id),
  );
  let StatusIcon: LucideIcon = Archive;
  let nextStatus: ProjectStatus = 'archived';
  let actionLabel = '归档';
  if (project.status === 'active') {
    StatusIcon = Plus;
    nextStatus = 'completed';
    actionLabel = '标记完成';
  } else if (project.status === 'completed') {
    StatusIcon = RotateCcw;
    nextStatus = 'active';
    actionLabel = '继续创作';
  } else {
    StatusIcon = RotateCcw;
    nextStatus = 'active';
    actionLabel = '恢复项目';
  }

  return (
    <article className="project-card">
      <div className="project-card__heading">
        <div>
          <span className={`project-status project-status--${project.status}`}>
            {statusLabel(project.status)}
          </span>
          <h3>{project.title}</h3>
          <p>
            {origins.find((origin) => origin.value === project.creationOrigin)?.label ?? '未知起点'}
            {project.originNote ? ` · ${project.originNote}` : ''}
          </p>
        </div>
        <div className="project-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onStatus(project.id, nextStatus)}
            type="button"
          >
            <StatusIcon size={14} /> {actionLabel}
          </button>
          {project.status !== 'archived' && (
            <button
              className="icon-button"
              disabled={busy}
              onClick={() => onStatus(project.id, 'archived')}
              title="归档项目"
              type="button"
            >
              <Archive size={15} />
            </button>
          )}
        </div>
      </div>

      <div className="context-strip">
        <strong>账号 Context</strong>
        {project.accountLinks.map((link) => (
          <span
            className={link.isPrimary ? 'context-chip context-chip--primary' : 'context-chip'}
            key={link.accountId}
          >
            {link.accountName}
            {link.isPrimary && <small>Primary</small>}
            <button
              aria-label={`解除关联 ${link.accountName}`}
              disabled={busy}
              onClick={() => onUnlink(project.id, link.accountId)}
              type="button"
            >
              <Unlink size={12} />
            </button>
          </span>
        ))}
        {project.accountLinks.length === 0 && <span className="context-empty">尚未关联账号</span>}
        {availableAccounts.length > 0 && (
          <span className="context-linker">
            <select
              aria-label={`为 ${project.title} 选择账号`}
              onChange={(event) => onLinkSelection(project.id, event.target.value)}
              value={linkSelection}
            >
              <option value="">添加账号…</option>
              {availableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
            <button
              aria-label={`关联账号到 ${project.title}`}
              disabled={busy || !linkSelection}
              onClick={() => onLink(project.id)}
              title="关联并设为主要账号"
              type="button"
            >
              <Link2 size={13} />
            </button>
          </span>
        )}
      </div>
      <footer>
        <span>{primaryAccount ? `主要账号：${primaryAccount.accountName}` : '未设置主要账号'}</span>
        <span>各创作模块可独立使用</span>
      </footer>
    </article>
  );
}
