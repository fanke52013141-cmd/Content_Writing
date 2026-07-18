'use client';

import { Archive, Check, FileText, Plus, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import type { Outline, OutlineSection } from '@content-writing/contracts';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3100/api/v1';

function sectionsFromText(value: string): OutlineSection[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((heading) => ({ heading, purpose: '', keyPoints: [], evidenceMaterialIds: [] }));
}

function sectionsToText(sections: readonly OutlineSection[]): string {
  return sections.map((section) => section.heading).join('\n');
}

export function OutlineWorkspace() {
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sections, setSections] = useState('开场\n核心判断\n行动建议');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const selected = useMemo(
    () => outlines.find((outline) => outline.id === selectedId) ?? null,
    [outlines, selectedId],
  );

  async function load() {
    try {
      const response = await fetch(`${apiBase}/outlines`);
      if (!response.ok) throw new Error('load failed');
      setOutlines((await response.json()) as Outline[]);
    } catch {
      setStatus('本地服务未连接');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function select(outline: Outline) {
    setSelectedId(outline.id);
    setTitle(outline.title);
    setSummary(outline.summary);
    setSections(sectionsToText(outline.sections));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { title, summary, sections: sectionsFromText(sections) };
    const response = await fetch(
      selected ? `${apiBase}/outlines/${selected.id}` : `${apiBase}/outlines`,
      {
        method: selected ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok) {
      setStatus('保存失败');
      return;
    }
    const outline = (await response.json()) as Outline;
    setOutlines((current) =>
      selected
        ? current.map((item) => (item.id === outline.id ? outline : item))
        : [outline, ...current],
    );
    select(outline);
    setStatus(selected ? '框架已保存' : '框架已创建');
  }

  async function changeStatus(outline: Outline, nextStatus: 'active' | 'archived') {
    const response = await fetch(`${apiBase}/outlines/${outline.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!response.ok) return;
    const updated = (await response.json()) as Outline;
    setOutlines((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    select(updated);
  }

  return (
    <div className="outline-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">结构化写作</p>
        <h1>文章框架</h1>
        <p>把选题拆成可执行的章节，之后再进入正文和评审。</p>
      </section>
      <div className="outline-layout">
        <section className="outline-list" aria-label="框架列表">
          <div className="section-heading">
            <h2>我的框架</h2>
            <button
              className="secondary-button"
              onClick={() => {
                setSelectedId(null);
                setTitle('');
                setSummary('');
              }}
              type="button"
            >
              <Plus size={16} /> 新建
            </button>
          </div>
          {outlines.length === 0 ? (
            <div className="empty-state">
              <FileText size={25} />
              <strong>还没有框架</strong>
              <p>先写一个章节骨架。</p>
            </div>
          ) : (
            outlines.map((outline) => (
              <button
                className={
                  outline.id === selectedId ? 'outline-item outline-item--active' : 'outline-item'
                }
                key={outline.id}
                onClick={() => select(outline)}
                type="button"
              >
                <strong>{outline.title}</strong>
                <small>
                  {outline.sections.length} 个章节 ·{' '}
                  {outline.status === 'active' ? '进行中' : '已归档'}
                </small>
              </button>
            ))
          )}
        </section>
        <form className="outline-editor" onSubmit={(event) => void submit(event)}>
          <div className="section-heading">
            <div>
              <span className="eyebrow">{selected ? '编辑框架' : '新建框架'}</span>
              <h2>{selected ? selected.title : '未命名框架'}</h2>
            </div>
            <Save size={18} />
          </div>
          <label>
            标题
            <input onChange={(event) => setTitle(event.target.value)} required value={title} />
          </label>
          <label>
            摘要
            <textarea
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              value={summary}
            />
          </label>
          <label>
            章节标题
            <textarea
              onChange={(event) => setSections(event.target.value)}
              rows={8}
              value={sections}
            />
            <small>每行一个章节，保存后可继续扩展论点和证据。</small>
          </label>
          <div className="outline-editor__actions">
            <button className="primary-button" type="submit">
              <Check size={16} /> 保存框架
            </button>
            {selected && (
              <button
                className="icon-button"
                aria-label={selected.status === 'active' ? '归档框架' : '恢复框架'}
                onClick={() =>
                  void changeStatus(selected, selected.status === 'active' ? 'archived' : 'active')
                }
                type="button"
              >
                {selected.status === 'active' ? <Archive size={17} /> : <RotateCcw size={17} />}
              </button>
            )}
          </div>
          {status && (
            <p className="form-status" role="status">
              {status}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
