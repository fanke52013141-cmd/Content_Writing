'use client';

import type {
  ExternalSearchRun,
  ExternalSourcePolicy,
  HotTopicItem,
  HotTopicSource,
} from '@content-writing/contracts';
import { Check, ExternalLink, Flame, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3100/api/v1';

const sourceLabels: Record<HotTopicSource, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  weibo: '微博',
  zhihu: '知乎',
  baidu: '百度',
  toutiao: '今日头条',
  thepaper: '澎湃',
  '36kr': '36Kr',
  huxiu: '虎嗅',
  bilibili: 'B站',
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? '请求失败');
  }
  return response.json() as Promise<T>;
}

export function DiscoveryWorkspace() {
  const [policies, setPolicies] = useState<readonly ExternalSourcePolicy[]>([]);
  const [source, setSource] = useState<HotTopicSource>('douyin');
  const [hotTopics, setHotTopics] = useState<readonly HotTopicItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchRun, setSearchRun] = useState<ExternalSearchRun | null>(null);
  const [status, setStatus] = useState('');
  const hotPolicies = useMemo(
    () => policies.filter((policy) => policy.kind === 'hot_topic'),
    [policies],
  );
  const currentPolicy = hotPolicies.find((policy) => policy.sourceKey === source);
  const searchPolicy = policies.find(
    (policy) => policy.kind === 'search' && policy.sourceKey === 'searxng',
  );

  async function loadPolicies() {
    try {
      const next = await request<ExternalSourcePolicy[]>('/discovery/sources');
      setPolicies(next);
      const first = next.find((policy) => policy.kind === 'hot_topic');
      if (first) setSource(first.sourceKey as HotTopicSource);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '来源策略加载失败');
    }
  }

  useEffect(() => {
    void loadPolicies();
  }, []);

  async function approve(policy: ExternalSourcePolicy) {
    try {
      const updated = await request<ExternalSourcePolicy>(`/discovery/sources/${policy.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          termsReviewStatus: 'approved',
          enabled: true,
          reviewNote: '已由作者逐项核对来源条款，允许在本地工作台使用。',
        }),
      });
      setPolicies((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatus(`${policy.displayName} 已批准，可抓取。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '来源审核失败');
    }
  }

  async function refresh() {
    try {
      const items = await request<HotTopicItem[]>(
        `/discovery/hot-topics?source=${encodeURIComponent(source)}&limit=20`,
      );
      setHotTopics(items);
      setStatus(`已刷新 ${sourceLabels[source]} 热榜。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '热榜刷新失败');
    }
  }

  async function createTopic(item: HotTopicItem) {
    try {
      await request(`/discovery/hot-topics/${item.id}/topics`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStatus(`已将“${item.title}”创建为可追溯选题。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '创建选题失败');
    }
  }

  async function search() {
    if (!searchQuery.trim()) return;
    try {
      setSearchRun(
        await request<ExternalSearchRun>('/discovery/search', {
          method: 'POST',
          body: JSON.stringify({ query: searchQuery.trim(), limit: 10 }),
        }),
      );
      setStatus('搜索结果已保存到本地历史。');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '外部搜索失败');
    }
  }

  return (
    <div className="discovery-workspace">
      <section className="workspace-intro">
        <p className="eyebrow">热点与外部搜索</p>
        <h1>发现可写的内容机会</h1>
        <p>热点只做选题线索，搜索只保存摘要；每个来源必须先完成条款审查。</p>
      </section>

      <section className="discovery-policy-panel" aria-label="来源条款审查">
        <div className="section-heading">
          <div>
            <span className="eyebrow">逐来源审查</span>
            <h2>来源许可</h2>
          </div>
          <ShieldCheck size={19} />
        </div>
        <div className="discovery-policy-grid">
          {policies.map((policy) => (
            <div className="discovery-policy" key={policy.id}>
              <div>
                <strong>{policy.displayName}</strong>
                <small>
                  {policy.termsReviewStatus === 'approved'
                    ? policy.enabled
                      ? '已审查并启用'
                      : '已审查但未启用'
                    : policy.termsReviewStatus === 'restricted'
                      ? '限制使用'
                      : '待条款审查'}
                </small>
              </div>
              <a href={policy.referenceUrl} target="_blank" rel="noreferrer" title="打开来源说明">
                <ExternalLink size={14} />
              </a>
              {policy.termsReviewStatus !== 'approved' && (
                <button
                  className="secondary-button"
                  onClick={() => void approve(policy)}
                  type="button"
                >
                  <Check size={14} /> 审查通过
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="discovery-layout">
        <section className="discovery-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">不含微信</span>
              <h2>热点榜</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => void refresh()}
              title="刷新热点"
              type="button"
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <div className="source-tabs" role="tablist" aria-label="热点来源">
            {hotPolicies.map((policy) => (
              <button
                className={
                  policy.sourceKey === source ? 'source-tab source-tab--active' : 'source-tab'
                }
                key={policy.id}
                onClick={() => setSource(policy.sourceKey as HotTopicSource)}
                role="tab"
                type="button"
              >
                {sourceLabels[policy.sourceKey as HotTopicSource] ?? policy.displayName}
              </button>
            ))}
          </div>
          {currentPolicy?.termsReviewStatus !== 'approved' || !currentPolicy.enabled ? (
            <div className="empty-state">
              <ShieldCheck size={24} />
              <strong>先完成来源条款审查</strong>
              <p>批准当前来源后，刷新按钮才会访问热榜服务。</p>
            </div>
          ) : hotTopics.length === 0 ? (
            <div className="empty-state">
              <Flame size={24} />
              <strong>还没有本地热榜</strong>
              <p>点击刷新，把热点作为候选线索保存到本地。</p>
            </div>
          ) : (
            <ol className="discovery-results">
              {hotTopics.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>
                      {item.popularity ? `热度 ${item.popularity.toLocaleString()}` : '热度未提供'}
                    </small>
                  </div>
                  <div className="discovery-result-actions">
                    <a href={item.url} target="_blank" rel="noreferrer" title="查看原始来源">
                      <ExternalLink size={14} />
                    </a>
                    <button
                      className="secondary-button"
                      onClick={() => void createTopic(item)}
                      type="button"
                    >
                      创建选题
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="discovery-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SearXNG</span>
              <h2>外部搜索</h2>
            </div>
            <Search size={18} />
          </div>
          {searchPolicy?.termsReviewStatus !== 'approved' || !searchPolicy.enabled ? (
            <div className="empty-state">
              <ShieldCheck size={24} />
              <strong>先完成搜索来源审查</strong>
              <p>搜索服务默认关闭，批准后才会发送查询。</p>
            </div>
          ) : (
            <>
              <div className="discovery-search-form">
                <input
                  aria-label="外部搜索关键词"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void search();
                  }}
                  placeholder="输入关键词或 site: 域名"
                  value={searchQuery}
                />
                <button className="primary-button" onClick={() => void search()} type="button">
                  <Search size={15} /> 搜索
                </button>
              </div>
              {!searchRun ? (
                <div className="empty-state">
                  <Search size={24} />
                  <strong>等待一次搜索</strong>
                  <p>仅保存标题、摘要和链接。</p>
                </div>
              ) : (
                <ol className="discovery-results">
                  {searchRun.results.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.domain} · {item.snippet}
                        </small>
                      </div>
                      <a href={item.url} target="_blank" rel="noreferrer" title="打开搜索结果">
                        <ExternalLink size={14} />
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </section>
      </div>
      {status && (
        <p className="form-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
