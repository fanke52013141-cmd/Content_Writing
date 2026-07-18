'use client';

import type {
  ContentProject,
  Material,
  MaterialKind,
  MaterialStatus,
  TermsReviewStatus,
  Topic,
} from '@content-writing/contracts';
import {
  Archive,
  CircleAlert,
  Edit3,
  FileInput,
  FileText,
  Link2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Unlink,
  Upload,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

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

async function uploadMaterial(formData: FormData): Promise<Material> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1/materials/file`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    throw new Error('本地服务未连接，请先启动平台。');
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? '文件导入失败');
  }
  return response.json() as Promise<Material>;
}

const kindLabels: Record<MaterialKind, string> = {
  plain_text: '纯文本',
  markdown: 'Markdown',
  docx: 'DOCX',
  pdf: '文本 PDF',
  webpage: '网页',
};

function statusLabel(status: MaterialStatus): string {
  return status === 'archived' ? '已归档' : '可使用';
}

function reviewLabel(status: TermsReviewStatus): string {
  if (status === 'pending') return '待条款审查';
  if (status === 'approved') return '已审查可用';
  if (status === 'restricted') return '限制使用';
  return '无需审查';
}

export function MaterialWorkspace() {
  const [materials, setMaterials] = useState<readonly Material[]>([]);
  const [projects, setProjects] = useState<readonly ContentProject[]>([]);
  const [topics, setTopics] = useState<readonly Topic[]>([]);
  const [mode, setMode] = useState<'text' | 'url' | 'file'>('text');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async (): Promise<void> => {
    const [nextMaterials, nextProjects, nextTopics] = await Promise.all([
      request<readonly Material[]>('/api/v1/materials'),
      request<readonly ContentProject[]>('/api/v1/projects'),
      request<readonly Topic[]>('/api/v1/topics'),
    ]);
    setMaterials(nextMaterials);
    setProjects(nextProjects.filter((project) => project.status !== 'archived'));
    setTopics(nextTopics.filter((topic) => topic.status !== 'archived'));
  };

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '无法读取素材库');
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

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await runMutation(async () => {
      if (mode === 'text') {
        await request<Material>('/api/v1/materials/text', {
          method: 'POST',
          body: JSON.stringify({ title, kind: 'markdown', content, notes }),
        });
      } else if (mode === 'url') {
        await request<Material>('/api/v1/materials/url', {
          method: 'POST',
          body: JSON.stringify({ url, ...(title ? { title } : {}), notes }),
        });
      } else {
        if (!file) throw new Error('请选择一个 TXT、Markdown、DOCX 或文本 PDF 文件。');
        const formData = new FormData();
        if (title) formData.append('title', title);
        if (notes) formData.append('notes', notes);
        formData.append('file', file);
        await uploadMaterial(formData);
      }
      setTitle('');
      setContent('');
      setUrl('');
      setNotes('');
      setFile(null);
    }, '素材创建失败');
  };

  const visibleMaterials = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return materials;
    return materials.filter((material) =>
      [material.title, material.extractedText, material.sourceSiteName]
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalized),
    );
  }, [materials, query]);

  return (
    <div className="material-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">来源可追溯的研究资产</p>
          <h1>素材库</h1>
          <p>保存文本、网页和可提取文档，之后可以从项目或选题中复用。</p>
        </div>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      )}

      <section className="material-create" aria-labelledby="material-create-heading">
        <div className="section-heading">
          <div>
            <h2 id="material-create-heading">导入素材</h2>
            <span>保留来源和抽取结果，原文件保存在本地</span>
          </div>
        </div>
        <div className="material-mode" role="tablist" aria-label="素材导入方式">
          <button
            aria-selected={mode === 'text'}
            className={mode === 'text' ? 'mode-tab mode-tab--active' : 'mode-tab'}
            onClick={() => setMode('text')}
            role="tab"
            type="button"
          >
            <FileText size={15} /> 文本 / Markdown
          </button>
          <button
            aria-selected={mode === 'url'}
            className={mode === 'url' ? 'mode-tab mode-tab--active' : 'mode-tab'}
            onClick={() => setMode('url')}
            role="tab"
            type="button"
          >
            <Link2 size={15} /> 网页 URL
          </button>
          <button
            aria-selected={mode === 'file'}
            className={mode === 'file' ? 'mode-tab mode-tab--active' : 'mode-tab'}
            onClick={() => setMode('file')}
            role="tab"
            type="button"
          >
            <Upload size={15} /> 上传文件
          </button>
        </div>
        <form className="material-create__form" onSubmit={(event) => void create(event)}>
          {mode !== 'file' && (
            <label>
              标题{mode === 'url' && <small>可留空，自动读取网页标题</small>}
              <input
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={mode === 'url' ? '网页标题（可选）' : '这份素材讲了什么？'}
                required={mode === 'text'}
                value={title}
              />
            </label>
          )}
          {mode === 'text' && (
            <label className="material-create__wide">
              内容
              <textarea
                maxLength={1_000_000}
                onChange={(event) => setContent(event.target.value)}
                placeholder="粘贴纯文本或 Markdown 内容"
                required
                value={content}
              />
            </label>
          )}
          {mode === 'url' && (
            <label className="material-create__wide">
              网页 URL
              <input
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/article"
                required
                type="url"
                value={url}
              />
            </label>
          )}
          {mode === 'file' && (
            <label className="material-create__wide material-file-picker">
              文件
              <input
                accept=".txt,.md,.markdown,.docx,.pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                type="file"
              />
              <span>
                <FileInput size={18} /> {file?.name ?? '选择 TXT、Markdown、DOCX 或文本 PDF'}
              </span>
            </label>
          )}
          <label>
            备注
            <textarea
              maxLength={20_000}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="记录使用场景或来源说明"
              value={notes}
            />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            <Plus size={16} /> 保存素材
          </button>
        </form>
      </section>

      <section aria-labelledby="material-list-heading">
        <div className="section-heading material-list-heading">
          <div>
            <h2 id="material-list-heading">全部素材</h2>
            <span>{visibleMaterials.length} 份素材</span>
          </div>
          <label className="material-search">
            <Search size={15} />
            <input
              aria-label="搜索素材"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、正文、站点"
              value={query}
            />
          </label>
        </div>
        {visibleMaterials.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} />
            <strong>{materials.length === 0 ? '还没有素材' : '没有匹配的素材'}</strong>
            <p>导入一份可追溯的文本、网页或文档。</p>
          </div>
        ) : (
          <div className="material-list">
            {visibleMaterials.map((material) => (
              <MaterialCard
                busy={busy}
                key={material.id}
                onStatus={(materialId, status) =>
                  void runMutation(
                    () =>
                      request<Material>(`/api/v1/materials/${materialId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status }),
                      }),
                    '素材状态更新失败',
                  )
                }
                onUpdate={(materialId, input) =>
                  void runMutation(
                    () =>
                      request<Material>(`/api/v1/materials/${materialId}`, {
                        method: 'PATCH',
                        body: JSON.stringify(input),
                      }),
                    '素材更新失败',
                  )
                }
                onReview={(materialId, status) =>
                  void runMutation(
                    () =>
                      request<Material>(`/api/v1/materials/${materialId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ termsReviewStatus: status }),
                      }),
                    '条款审查状态更新失败',
                  )
                }
                onLink={(materialId, type, contextId) =>
                  void runMutation(
                    () =>
                      request<Material>(
                        `/api/v1/materials/${materialId}/${type === 'project' ? 'projects' : 'topics'}/${contextId}`,
                        { method: 'PUT' },
                      ),
                    '素材关联失败',
                  )
                }
                onUnlink={(materialId, type, contextId) =>
                  void runMutation(
                    () =>
                      request<Material>(
                        `/api/v1/materials/${materialId}/${type === 'project' ? 'projects' : 'topics'}/${contextId}`,
                        { method: 'DELETE' },
                      ),
                    '素材解除关联失败',
                  )
                }
                projects={projects}
                topics={topics}
                material={material}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MaterialCard({
  busy,
  material,
  onLink,
  onReview,
  onStatus,
  onUnlink,
  onUpdate,
  projects,
  topics,
}: {
  busy: boolean;
  material: Material;
  onLink: (materialId: string, type: 'project' | 'topic', contextId: string) => void;
  onReview: (materialId: string, status: Exclude<TermsReviewStatus, 'not_applicable'>) => void;
  onStatus: (materialId: string, status: MaterialStatus) => void;
  onUnlink: (materialId: string, type: 'project' | 'topic', contextId: string) => void;
  onUpdate: (materialId: string, input: { title?: string; notes?: string }) => void;
  projects: readonly ContentProject[];
  topics: readonly Topic[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(material.title);
  const [draftNotes, setDraftNotes] = useState(material.notes);
  const [projectSelection, setProjectSelection] = useState('');
  const [topicSelection, setTopicSelection] = useState('');
  const availableProjects = projects.filter(
    (project) => !material.projectLinks.some((link) => link.projectId === project.id),
  );
  const availableTopics = topics.filter(
    (topic) => !material.topicLinks.some((link) => link.topicId === topic.id),
  );

  useEffect(() => {
    setDraftTitle(material.title);
    setDraftNotes(material.notes);
  }, [material]);

  return (
    <article className="material-card">
      <div className="material-card__heading">
        <div>
          <div className="material-card__meta">
            <span className={`material-status material-status--${material.status}`}>
              {statusLabel(material.status)}
            </span>
            <span className="material-kind">{kindLabels[material.kind]}</span>
            {material.kind === 'webpage' && (
              <span className={`terms-status terms-status--${material.termsReviewStatus}`}>
                {reviewLabel(material.termsReviewStatus)}
              </span>
            )}
          </div>
          {editing ? (
            <input
              aria-label="编辑素材标题"
              maxLength={240}
              onChange={(event) => setDraftTitle(event.target.value)}
              value={draftTitle}
            />
          ) : (
            <h3>{material.title}</h3>
          )}
          <p>
            {material.sourceUrl ? (
              <a href={material.sourceUrl} rel="noreferrer" target="_blank">
                {material.sourceSiteName || material.sourceUrl}
              </a>
            ) : material.originalFilename ? (
              `${material.originalFilename} · ${material.byteSize ?? 0} bytes`
            ) : (
              '本地手动内容'
            )}
          </p>
        </div>
        <div className="material-actions">
          {editing ? (
            <>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => {
                  onUpdate(material.id, { title: draftTitle, notes: draftNotes });
                  setEditing(false);
                }}
                type="button"
              >
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
          )}
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              onStatus(material.id, material.status === 'archived' ? 'active' : 'archived')
            }
            type="button"
          >
            {material.status === 'archived' ? <RotateCcw size={14} /> : <Archive size={14} />}
            {material.status === 'archived' ? '恢复' : '归档'}
          </button>
        </div>
      </div>

      {editing ? (
        <label className="material-notes-editor">
          备注
          <textarea
            maxLength={20_000}
            onChange={(event) => setDraftNotes(event.target.value)}
            value={draftNotes}
          />
        </label>
      ) : (
        <p className="material-preview">{material.extractedText.slice(0, 360)}</p>
      )}

      <div className="material-details">
        <span>
          <strong>来源哈希</strong>
          {material.sha256 ? `${material.sha256.slice(0, 16)}…` : '无文件哈希'}
        </span>
        <span>
          <strong>网页快照</strong>
          {material.rawSnapshotExpiresAt
            ? `保留至 ${new Date(material.rawSnapshotExpiresAt).toLocaleDateString('zh-CN')}`
            : '无'}
        </span>
        <span>
          <strong>抽取提示</strong>
          {material.extractionWarnings.length ? material.extractionWarnings.join('；') : '无'}
        </span>
        <span>
          <strong>备注</strong>
          {material.notes || '未设置'}
        </span>
      </div>

      {material.kind === 'webpage' && (
        <label className="terms-review-control">
          条款审查
          <select
            disabled={busy}
            onChange={(event) =>
              onReview(
                material.id,
                event.target.value as Exclude<TermsReviewStatus, 'not_applicable'>,
              )
            }
            value={
              material.termsReviewStatus === 'not_applicable'
                ? 'pending'
                : material.termsReviewStatus
            }
          >
            <option value="pending">待审查</option>
            <option value="approved">已审查可用</option>
            <option value="restricted">限制使用</option>
          </select>
        </label>
      )}

      <div className="material-contexts">
        <div className="context-strip">
          <strong>项目</strong>
          {material.projectLinks.map((link) => (
            <span className="context-chip" key={link.projectId}>
              {link.projectTitle}
              <button
                aria-label={`解除与 ${link.projectTitle} 的关联`}
                disabled={busy}
                onClick={() => onUnlink(material.id, 'project', link.projectId)}
                type="button"
              >
                <Unlink size={12} />
              </button>
            </span>
          ))}
          {material.projectLinks.length === 0 && <span className="context-empty">未关联</span>}
          {availableProjects.length > 0 && (
            <span className="context-linker">
              <select
                aria-label={`为 ${material.title} 选择项目`}
                onChange={(event) => setProjectSelection(event.target.value)}
                value={projectSelection}
              >
                <option value="">关联项目…</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
              <button
                aria-label="关联项目"
                disabled={busy || !projectSelection}
                onClick={() => onLink(material.id, 'project', projectSelection)}
                type="button"
              >
                <Link2 size={14} />
              </button>
            </span>
          )}
        </div>
        <div className="context-strip">
          <strong>选题</strong>
          {material.topicLinks.map((link) => (
            <span className="context-chip" key={link.topicId}>
              {link.topicTitle}
              <button
                aria-label={`解除与 ${link.topicTitle} 的关联`}
                disabled={busy}
                onClick={() => onUnlink(material.id, 'topic', link.topicId)}
                type="button"
              >
                <Unlink size={12} />
              </button>
            </span>
          ))}
          {material.topicLinks.length === 0 && <span className="context-empty">未关联</span>}
          {availableTopics.length > 0 && (
            <span className="context-linker">
              <select
                aria-label={`为 ${material.title} 选择选题`}
                onChange={(event) => setTopicSelection(event.target.value)}
                value={topicSelection}
              >
                <option value="">关联选题…</option>
                {availableTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
              <button
                aria-label="关联选题"
                disabled={busy || !topicSelection}
                onClick={() => onLink(material.id, 'topic', topicSelection)}
                type="button"
              >
                <Link2 size={14} />
              </button>
            </span>
          )}
        </div>
      </div>
      <footer>
        <span>{material.createdAt.slice(0, 10)}</span>
        <span>{material.fileAvailable ? '原文件已保存到本地' : '仅保存提取文本与来源'}</span>
      </footer>
    </article>
  );
}
