'use client';

import {
  Archive,
  BookOpenText,
  Check,
  FilePenLine,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Article, ReviewCapabilityKey, ReviewVerdict } from '@content-writing/contracts';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3100/api/v1';
const capabilityLabels: Record<ReviewCapabilityKey, string> = {
  'review.positioning': '账号定位与表达一致性',
  'review.fact-risk': '事实、引用和风险检查',
  'review.readability': '公众号可读性与传播力',
};
const verdictLabels: Record<ReviewVerdict, string> = {
  pass: '通过',
  needs_revision: '需要改写',
  blocked: '阻断发布',
};

export function ArticleWorkspace() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [candidateTitle, setCandidateTitle] = useState('');
  const [candidateBody, setCandidateBody] = useState('');
  const [capabilityKey, setCapabilityKey] = useState<ReviewCapabilityKey>('review.positioning');
  const [verdict, setVerdict] = useState<ReviewVerdict>('needs_revision');
  const [reviewSummary, setReviewSummary] = useState('');
  const [status, setStatus] = useState('');
  const selected = useMemo(
    () => articles.find((article) => article.id === selectedId) ?? null,
    [articles, selectedId],
  );

  async function load() {
    try {
      const response = await fetch(`${apiBase}/articles`);
      if (!response.ok) throw new Error('load failed');
      setArticles((await response.json()) as Article[]);
    } catch {
      setStatus('本地服务未连接');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function select(article: Article) {
    setSelectedId(article.id);
    setTitle(article.title);
    setBody(article.currentVersion.body);
    setCandidateTitle(`${article.title}（候选）`);
    setCandidateBody(article.currentVersion.body);
  }

  function reset() {
    setSelectedId(null);
    setTitle('');
    setBody('');
    setCandidateTitle('');
    setCandidateBody('');
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`${apiBase}/articles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    if (!response.ok) {
      setStatus('文章创建失败');
      return;
    }
    const article = (await response.json()) as Article;
    setArticles((current) => [article, ...current]);
    select(article);
    setStatus('文章已创建');
  }

  async function createCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const response = await fetch(`${apiBase}/articles/${selected.id}/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: candidateTitle,
        body: candidateBody,
        kind: 'revision_candidate',
      }),
    });
    if (!response.ok) {
      setStatus('候选版本创建失败');
      return;
    }
    const article = (await response.json()) as Article;
    setArticles((current) => current.map((item) => (item.id === article.id ? article : item)));
    select(article);
    setStatus('候选版本已保存，Current 未改变');
  }

  async function accept(versionId: string) {
    if (!selected) return;
    const response = await fetch(
      `${apiBase}/articles/${selected.id}/versions/${versionId}/accept`,
      { method: 'POST' },
    );
    if (!response.ok) {
      setStatus('接受候选失败');
      return;
    }
    const article = (await response.json()) as Article;
    setArticles((current) => current.map((item) => (item.id === article.id ? article : item)));
    select(article);
    setStatus('候选已切换为 Current');
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const response = await fetch(`${apiBase}/articles/${selected.id}/reviews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        versionId: selected.currentVersionId,
        capabilityKey,
        verdict,
        summary: reviewSummary,
        findings: [],
      }),
    });
    if (!response.ok) {
      setStatus('评审保存失败');
      return;
    }
    const article = (await response.json()) as Article;
    setArticles((current) => current.map((item) => (item.id === article.id ? article : item)));
    select(article);
    setReviewSummary('');
    setStatus('评审已记录');
  }

  async function changeStatus() {
    if (!selected) return;
    const nextStatus = selected.status === 'active' ? 'archived' : 'active';
    const response = await fetch(`${apiBase}/articles/${selected.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) return;
    const article = (await response.json()) as Article;
    setArticles((current) => current.map((item) => (item.id === article.id ? article : item)));
    select(article);
  }

  return (
    <div className="article-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">文章工作台</p>
        <h1>我的文章</h1>
        <p>正文、候选版本和三类评审记录分开保存，接受候选后才会更新 Current。</p>
      </section>
      <div className="article-layout">
        <section className="article-list" aria-label="文章列表">
          <div className="section-heading">
            <h2>文章</h2>
            <button className="secondary-button" onClick={reset} type="button">
              <Plus size={16} /> 新建
            </button>
          </div>
          {articles.length === 0 ? (
            <div className="empty-state">
              <BookOpenText size={25} />
              <strong>还没有文章</strong>
              <p>先保存一篇手工正文。</p>
            </div>
          ) : (
            articles.map((article) => (
              <button
                className={
                  article.id === selectedId ? 'article-item article-item--active' : 'article-item'
                }
                key={article.id}
                onClick={() => select(article)}
                type="button"
              >
                <strong>{article.title}</strong>
                <small>
                  {article.versions.length} 个版本 ·{' '}
                  {article.status === 'active' ? '进行中' : '已归档'}
                </small>
              </button>
            ))
          )}
        </section>

        {!selected ? (
          <form className="article-editor" onSubmit={(event) => void create(event)}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">手工正文</span>
                <h2>新建文章</h2>
              </div>
              <Save size={18} />
            </div>
            <label>
              标题
              <input onChange={(event) => setTitle(event.target.value)} required value={title} />
            </label>
            <label>
              正文
              <textarea
                onChange={(event) => setBody(event.target.value)}
                required
                rows={14}
                value={body}
              />
            </label>
            <button className="primary-button" type="submit">
              <Check size={16} /> 保存为 Current
            </button>
          </form>
        ) : (
          <section className="article-editor">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Current 正文</span>
                <h2>{selected.title}</h2>
              </div>
              <button
                aria-label={selected.status === 'active' ? '归档文章' : '恢复文章'}
                className="icon-button"
                onClick={() => void changeStatus()}
                type="button"
              >
                {selected.status === 'active' ? <Archive size={17} /> : <RotateCcw size={17} />}
              </button>
            </div>
            <div className="article-current">
              <div className="article-version-meta">
                <span>v{selected.currentVersion.versionNumber} · Current</span>
                <span>{selected.currentVersion.kind === 'manual' ? '手工' : '候选已接受'}</span>
              </div>
              <h3>{selected.currentVersion.title}</h3>
              <p>{selected.currentVersion.body}</p>
            </div>
            <form className="article-candidate" onSubmit={(event) => void createCandidate(event)}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">不可变候选</span>
                  <h3>创建改写候选</h3>
                </div>
                <FilePenLine size={18} />
              </div>
              <label>
                候选标题
                <input
                  onChange={(event) => setCandidateTitle(event.target.value)}
                  required
                  value={candidateTitle}
                />
              </label>
              <label>
                候选正文
                <textarea
                  onChange={(event) => setCandidateBody(event.target.value)}
                  required
                  rows={7}
                  value={candidateBody}
                />
              </label>
              <button className="secondary-button" type="submit">
                <Save size={16} /> 保存候选
              </button>
            </form>
            <div className="article-versions">
              <div className="section-heading">
                <h3>版本历史</h3>
                <span>{selected.versions.length} 个版本</span>
              </div>
              {selected.versions.map((version) => (
                <div className="article-version" key={version.id}>
                  <div>
                    <strong>
                      v{version.versionNumber} ·{' '}
                      {version.status === 'current'
                        ? 'Current'
                        : version.status === 'candidate'
                          ? '候选'
                          : '已替换'}
                    </strong>
                    <small>
                      {version.kind === 'manual'
                        ? '手工正文'
                        : version.kind === 'ai_candidate'
                          ? 'AI 候选'
                          : '改写候选'}
                    </small>
                  </div>
                  {version.status === 'candidate' && (
                    <button
                      className="secondary-button"
                      onClick={() => void accept(version.id)}
                      type="button"
                    >
                      <Check size={14} /> 接受
                    </button>
                  )}
                </div>
              ))}
            </div>
            <form className="article-review" onSubmit={(event) => void review(event)}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">Reviewer</span>
                  <h3>记录评审</h3>
                </div>
                <ShieldCheck size={18} />
              </div>
              <label>
                评审能力
                <select
                  value={capabilityKey}
                  onChange={(event) => setCapabilityKey(event.target.value as ReviewCapabilityKey)}
                >
                  {Object.entries(capabilityLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                结论
                <select
                  value={verdict}
                  onChange={(event) => setVerdict(event.target.value as ReviewVerdict)}
                >
                  {Object.entries(verdictLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                摘要
                <textarea
                  onChange={(event) => setReviewSummary(event.target.value)}
                  required
                  rows={3}
                  value={reviewSummary}
                />
              </label>
              <button className="secondary-button" type="submit">
                <ShieldCheck size={15} /> 保存评审
              </button>
              {selected.reviews.length > 0 && (
                <ul className="article-review-list">
                  {selected.reviews.map((reviewItem) => (
                    <li key={reviewItem.id}>
                      <strong>{capabilityLabels[reviewItem.capabilityKey]}</strong>
                      <span>
                        {verdictLabels[reviewItem.verdict]} · {reviewItem.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </section>
        )}
      </div>
      {status && (
        <p className="form-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
