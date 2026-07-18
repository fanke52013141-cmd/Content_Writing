'use client';

import type { Account, ContentProject, Topic, TopicStatus } from '@content-writing/contracts';
import { Archive, CircleAlert, Edit3, Link2, Plus, RotateCcw, Save, Unlink, X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3100';

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

function topicStatusLabel(status: TopicStatus): string {
  return status === 'archived' ? '已归档' : '可使用';
}

export function TopicWorkspace() {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [projects, setProjects] = useState<readonly ContentProject[]>([]);
  const [topics, setTopics] = useState<readonly Topic[]>([]);
  const [title, setTitle] = useState('');
  const [angle, setAngle] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [contentGoal, setContentGoal] = useState('');
  const [keywords, setKeywords] = useState('');
  const [accountId, setAccountId] = useState('');
  const [projectSelections, setProjectSelections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (): Promise<void> => {
    const [nextAccounts, nextProjects, nextTopics] = await Promise.all([
      request<readonly Account[]>('/api/v1/accounts'),
      request<readonly ContentProject[]>('/api/v1/projects'),
      request<readonly Topic[]>('/api/v1/topics'),
    ]);
    setAccounts(nextAccounts.filter((account) => account.status !== 'archived'));
    setProjects(nextProjects.filter((project) => project.status !== 'archived'));
    setTopics(nextTopics);
  };

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '无法读取选题库');
    });
  }, []);

  const runMutation = async (mutation: () => Promise<unknown>, fallback: string): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await mutation();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const createTopic = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await runMutation(async () => {
      await request<Topic>('/api/v1/topics', {
        method: 'POST',
        body: JSON.stringify({
          ...(accountId ? { accountId } : {}),
          title,
          angle,
          targetAudience,
          contentGoal,
          keywords: keywords
            .split(/[,，]/)
            .map((keyword) => keyword.trim())
            .filter(Boolean),
        }),
      });
      setTitle('');
      setAngle('');
      setTargetAudience('');
      setContentGoal('');
      setKeywords('');
    }, '选题创建失败');
  };

  const updateTopic = async (
    topicId: string,
    input: Partial<Pick<Topic, 'title' | 'angle' | 'targetAudience' | 'contentGoal' | 'keywords'>>,
  ): Promise<void> => {
    await runMutation(
      () =>
        request<Topic>(`/api/v1/topics/${topicId}`, {
          method: 'PATCH',
          body: JSON.stringify(input),
        }),
      '选题更新失败',
    );
  };

  const updateStatus = async (topicId: string, status: TopicStatus): Promise<void> => {
    await runMutation(
      () =>
        request<Topic>(`/api/v1/topics/${topicId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }),
      '选题状态更新失败',
    );
  };

  const linkProject = async (topicId: string): Promise<void> => {
    const projectId = projectSelections[topicId];
    if (!projectId) return;
    await runMutation(
      () =>
        request<Topic>(`/api/v1/topics/${topicId}/projects/${projectId}`, {
          method: 'PUT',
          body: JSON.stringify({ isPrimary: true }),
        }),
      '项目关联失败',
    );
  };

  const unlinkProject = async (topicId: string, projectId: string): Promise<void> => {
    await runMutation(
      () =>
        request<Topic>(`/api/v1/topics/${topicId}/projects/${projectId}`, {
          method: 'DELETE',
        }),
      '解除关联失败',
    );
  };

  return (
    <div className="topic-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">可复用的创作起点</p>
          <h1>选题库</h1>
          <p>先独立记录“写什么、从什么角度写”，需要时再关联项目；解除关系不会删除选题。</p>
        </div>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      )}

      <section className="topic-create" aria-labelledby="topic-create-heading">
        <div className="section-heading">
          <div>
            <h2 id="topic-create-heading">记录新选题</h2>
            <span>只要求标题，项目与账号 Context 都是可选项</span>
          </div>
        </div>
        <form className="topic-create__form" onSubmit={(event) => void createTopic(event)}>
          <label className="topic-create__title">
            选题标题
            <input
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="这篇内容准备回答什么问题？"
              required
              value={title}
            />
          </label>
          <label>
            账号 Context（可选）
            <select onChange={(event) => setAccountId(event.target.value)} value={accountId}>
              <option value="">暂不关联</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            切入角度
            <textarea
              maxLength={4000}
              onChange={(event) => setAngle(event.target.value)}
              placeholder="与常见写法相比，你准备从哪里切入？"
              value={angle}
            />
          </label>
          <label>
            目标读者
            <textarea
              maxLength={2000}
              onChange={(event) => setTargetAudience(event.target.value)}
              placeholder="最希望谁读到？"
              value={targetAudience}
            />
          </label>
          <label>
            内容目标
            <textarea
              maxLength={2000}
              onChange={(event) => setContentGoal(event.target.value)}
              placeholder="希望读者读完知道、相信或做到什么？"
              value={contentGoal}
            />
          </label>
          <label>
            关键词
            <input
              maxLength={500}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder="用逗号分隔，最多 20 个"
              value={keywords}
            />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            <Plus size={16} /> 保存选题
          </button>
        </form>
      </section>

      <section aria-labelledby="topic-list-heading">
        <div className="section-heading">
          <h2 id="topic-list-heading">全部选题</h2>
          <span>{topics.length} 个选题</span>
        </div>
        {topics.length === 0 ? (
          <div className="empty-state">
            <Plus size={28} />
            <strong>还没有选题</strong>
            <p>先记下一个值得回答的问题，之后再补角度和项目关系。</p>
          </div>
        ) : (
          <div className="topic-list">
            {topics.map((topic) => (
              <TopicCard
                accounts={accounts}
                busy={busy}
                key={topic.id}
                onLink={(topicId) => void linkProject(topicId)}
                onProjectSelection={(topicId, projectId) =>
                  setProjectSelections((current) => ({ ...current, [topicId]: projectId }))
                }
                onStatus={(topicId, status) => void updateStatus(topicId, status)}
                onUnlink={(topicId, projectId) => void unlinkProject(topicId, projectId)}
                onUpdate={(topicId, input) => void updateTopic(topicId, input)}
                projectSelection={projectSelections[topic.id] ?? ''}
                projects={projects}
                topic={topic}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TopicCard({
  accounts,
  busy,
  onLink,
  onProjectSelection,
  onStatus,
  onUnlink,
  onUpdate,
  projectSelection,
  projects,
  topic,
}: {
  accounts: readonly Account[];
  busy: boolean;
  onLink: (topicId: string) => void;
  onProjectSelection: (topicId: string, projectId: string) => void;
  onStatus: (topicId: string, status: TopicStatus) => void;
  onUnlink: (topicId: string, projectId: string) => void;
  onUpdate: (
    topicId: string,
    input: Pick<Topic, 'title' | 'angle' | 'targetAudience' | 'contentGoal' | 'keywords'>,
  ) => void;
  projectSelection: string;
  projects: readonly ContentProject[];
  topic: Topic;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: topic.title,
    angle: topic.angle,
    targetAudience: topic.targetAudience,
    contentGoal: topic.contentGoal,
    keywords: topic.keywords.join('，'),
  });
  const account = accounts.find((candidate) => candidate.id === topic.accountId);
  const availableProjects = projects.filter(
    (project) => !topic.projectLinks.some((link) => link.projectId === project.id),
  );

  useEffect(() => {
    setDraft({
      title: topic.title,
      angle: topic.angle,
      targetAudience: topic.targetAudience,
      contentGoal: topic.contentGoal,
      keywords: topic.keywords.join('，'),
    });
  }, [topic]);

  const save = (): void => {
    onUpdate(topic.id, {
      ...draft,
      keywords: draft.keywords
        .split(/[,，]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean),
    });
    setEditing(false);
  };

  return (
    <article className="topic-card">
      <div className="topic-card__heading">
        <div>
          <span className={`topic-status topic-status--${topic.status}`}>
            {topicStatusLabel(topic.status)}
          </span>
          {editing ? (
            <input
              aria-label="编辑选题标题"
              maxLength={240}
              onChange={(event) =>
                setDraft((current) => ({ ...current, title: event.target.value }))
              }
              value={draft.title}
            />
          ) : (
            <h3>{topic.title}</h3>
          )}
          {!editing && <p>{topic.angle || '尚未补充切入角度'}</p>}
        </div>
        <div className="topic-actions">
          {topic.source === 'manual' &&
            topic.status === 'active' &&
            (editing ? (
              <>
                <button className="secondary-button" disabled={busy} onClick={save} type="button">
                  <Save size={14} /> 保存
                </button>
                <button className="icon-button" onClick={() => setEditing(false)} type="button">
                  <X size={15} />
                </button>
              </>
            ) : (
              <button className="secondary-button" onClick={() => setEditing(true)} type="button">
                <Edit3 size={14} /> 编辑
              </button>
            ))}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => onStatus(topic.id, topic.status === 'archived' ? 'active' : 'archived')}
            type="button"
          >
            {topic.status === 'archived' ? <RotateCcw size={14} /> : <Archive size={14} />}
            {topic.status === 'archived' ? '恢复' : '归档'}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="topic-editor-grid">
          <label>
            切入角度
            <textarea
              maxLength={4000}
              onChange={(event) =>
                setDraft((current) => ({ ...current, angle: event.target.value }))
              }
              value={draft.angle}
            />
          </label>
          <label>
            目标读者
            <textarea
              maxLength={2000}
              onChange={(event) =>
                setDraft((current) => ({ ...current, targetAudience: event.target.value }))
              }
              value={draft.targetAudience}
            />
          </label>
          <label>
            内容目标
            <textarea
              maxLength={2000}
              onChange={(event) =>
                setDraft((current) => ({ ...current, contentGoal: event.target.value }))
              }
              value={draft.contentGoal}
            />
          </label>
          <label>
            关键词
            <input
              maxLength={500}
              onChange={(event) =>
                setDraft((current) => ({ ...current, keywords: event.target.value }))
              }
              value={draft.keywords}
            />
          </label>
        </div>
      ) : (
        <div className="topic-details">
          <span>
            <strong>目标读者</strong>
            {topic.targetAudience || '未设置'}
          </span>
          <span>
            <strong>内容目标</strong>
            {topic.contentGoal || '未设置'}
          </span>
          <span>
            <strong>账号 Context</strong>
            {account?.name ?? '未关联'}
          </span>
          <span>
            <strong>关键词</strong>
            {topic.keywords.join(' · ') || '未设置'}
          </span>
        </div>
      )}

      <div className="context-strip">
        <strong>项目关系</strong>
        {topic.projectLinks.map((link) => (
          <span
            className={link.isPrimary ? 'context-chip context-chip--primary' : 'context-chip'}
            key={link.projectId}
          >
            {link.projectTitle}
            {link.isPrimary && <small>Primary</small>}
            <button
              aria-label={`解除与 ${link.projectTitle} 的关联`}
              disabled={busy}
              onClick={() => onUnlink(topic.id, link.projectId)}
              type="button"
            >
              <Unlink size={12} />
            </button>
          </span>
        ))}
        {topic.projectLinks.length === 0 && <span className="context-empty">未关联项目</span>}
        {topic.status === 'active' && availableProjects.length > 0 && (
          <span className="context-linker">
            <select
              aria-label={`为 ${topic.title} 选择项目`}
              onChange={(event) => onProjectSelection(topic.id, event.target.value)}
              value={projectSelection}
            >
              <option value="">设为项目主选题…</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
            </select>
            <button
              aria-label="关联项目"
              disabled={busy || !projectSelection}
              onClick={() => onLink(topic.id)}
              type="button"
            >
              <Link2 size={14} />
            </button>
          </span>
        )}
      </div>
      <footer>
        <span>{topic.source === 'manual' ? '手动创建' : 'AI 不可变候选'}</span>
        <span>更新于 {new Date(topic.updatedAt).toLocaleString('zh-CN')}</span>
      </footer>
    </article>
  );
}
