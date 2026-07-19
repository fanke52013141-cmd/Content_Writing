'use client';

import type {
  LocalUser,
  ModelProviderConfig,
  ModelProviderKind,
  Prompt,
} from '@content-writing/contracts';
import { Check, KeyRound, Plus, Save, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3100/api/v1';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error('请求失败，请检查本地 API 服务');
  return response.json() as Promise<T>;
}

export function SettingsWorkspace() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [providers, setProviders] = useState<ModelProviderConfig[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [providerName, setProviderName] = useState('');
  const [providerKind, setProviderKind] = useState<ModelProviderKind>('openai_compatible');
  const [providerBaseUrl, setProviderBaseUrl] = useState('https://api.openai.com/v1');
  const [providerModel, setProviderModel] = useState('');
  const [providerKey, setProviderKey] = useState('');
  const [pin, setPin] = useState('');
  const [pinEnabled, setPinEnabled] = useState(false);
  const [status, setStatus] = useState('');

  async function load() {
    try {
      const [nextPrompts, nextProviders, localUser] = await Promise.all([
        request<Prompt[]>('/prompts'),
        request<ModelProviderConfig[]>('/model-providers'),
        request<LocalUser>('/me'),
      ]);
      setPrompts(nextPrompts);
      setProviders(nextProviders);
      setPinEnabled(localUser.pinEnabled);
      const first = nextPrompts[0];
      if (first) {
        setSelectedPromptId(first.id);
        setDraftBody(
          first.versions.find((version) => version.isDefault)?.body ??
            first.versions.at(-1)?.body ??
            '',
        );
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '设置加载失败');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function selectPrompt(prompt: Prompt) {
    setSelectedPromptId(prompt.id);
    setDraftBody(
      prompt.versions.find((version) => version.isDefault)?.body ??
        prompt.versions.at(-1)?.body ??
        '',
    );
  }

  async function savePromptVersion() {
    const prompt = prompts.find((item) => item.id === selectedPromptId);
    if (!prompt || !draftBody.trim()) return;
    try {
      const updated = await request<Prompt>(`/prompts/${prompt.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({ body: draftBody }),
      });
      setPrompts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setStatus('已创建候选版本，是否设为默认由你决定');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存失败');
    }
  }

  async function activate(promptId: string, versionId: string) {
    try {
      const updated = await request<Prompt>(`/prompts/${promptId}/versions/${versionId}/activate`, {
        method: 'POST',
        body: JSON.stringify({ isDefault: true }),
      });
      setPrompts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setStatus('已切换默认 Prompt 版本');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '激活失败');
    }
  }

  async function addProvider(event: React.FormEvent) {
    event.preventDefault();
    try {
      const created = await request<ModelProviderConfig>('/model-providers', {
        method: 'POST',
        body: JSON.stringify({
          name: providerName,
          kind: providerKind,
          baseUrl: providerBaseUrl,
          model: providerModel,
          apiKey: providerKey,
          enabled: true,
        }),
      });
      setProviders((items) => [created, ...items]);
      setProviderName('');
      setProviderModel('');
      setProviderKey('');
      setStatus('模型中转配置已保存，密钥不会回显');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '模型配置保存失败');
    }
  }

  async function savePin(event: React.FormEvent) {
    event.preventDefault();
    try {
      const updated = await request<LocalUser>('/settings/pin', {
        method: 'PUT',
        body: JSON.stringify({ pin }),
      });
      setPin('');
      setPinEnabled(updated.pinEnabled);
      setStatus('本地 PIN 已启用；关闭应用后不会自动登录');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PIN 设置失败');
    }
  }

  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedPromptId);
  return (
    <div className="settings-workspace">
      <section className="page-intro">
        <p className="eyebrow">高级模式</p>
        <h1>Prompt 与模型配置</h1>
        <p>示例 Prompt 可复制、编辑并建立多个 Active Version。安全边界由系统单独维护。</p>
      </section>
      {status && (
        <p className="form-status" role="status">
          {status}
        </p>
      )}
      <div className="settings-grid">
        <section className="settings-panel">
          <div className="section-heading">
            <div>
              <h2>
                <WandSparkles size={18} /> Prompt 版本
              </h2>
              <span>AI 完成后只产生不可变候选，不会覆盖正文</span>
            </div>
          </div>
          <div className="settings-prompt-list">
            {prompts.map((prompt) => (
              <button
                className={
                  prompt.id === selectedPromptId
                    ? 'settings-prompt settings-prompt--active'
                    : 'settings-prompt'
                }
                key={prompt.id}
                onClick={() => selectPrompt(prompt)}
                type="button"
              >
                <strong>{prompt.name}</strong>
                <small>
                  {prompt.capabilityKey} · {prompt.versions.length} 个版本
                </small>
              </button>
            ))}
            {prompts.length === 0 && (
              <p className="empty-state">数据库迁移后会显示系统示例 Prompt。</p>
            )}
          </div>
          {selectedPrompt && (
            <div className="settings-editor">
              <label htmlFor="prompt-body">当前编辑内容</label>
              <textarea
                id="prompt-body"
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
                rows={12}
              />
              <button
                className="primary-button"
                onClick={() => void savePromptVersion()}
                type="button"
              >
                <Save size={16} />
                创建候选版本
              </button>
              <div className="settings-versions">
                {selectedPrompt.versions.map((version) => (
                  <div className="settings-version" key={version.id}>
                    <span>
                      v{version.versionNumber} · {version.status}
                      {version.isDefault ? ' · 默认' : ''}
                    </span>
                    {version.status !== 'active' && (
                      <button
                        className="secondary-button"
                        onClick={() => void activate(selectedPrompt.id, version.id)}
                        type="button"
                      >
                        <Check size={14} />
                        设为默认
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <section className="settings-panel">
          <div className="section-heading">
            <div>
              <h2>
                <KeyRound size={18} /> 模型中转站
              </h2>
              <span>兼容国内、国外、OpenRouter、NewAPI 与 OpenAI-compatible</span>
            </div>
          </div>
          <form className="settings-provider-form" onSubmit={(event) => void addProvider(event)}>
            <label>
              名称
              <input
                value={providerName}
                onChange={(event) => setProviderName(event.target.value)}
                required
              />
            </label>
            <label>
              类型
              <select
                onChange={(event) => setProviderKind(event.target.value as ModelProviderKind)}
                value={providerKind}
              >
                <option value="openai_compatible">OpenAI-compatible</option>
                <option value="openrouter">OpenRouter</option>
                <option value="newapi">NewAPI</option>
                <option value="custom">其他兼容中转</option>
              </select>
            </label>
            <label>
              Base URL
              <input
                type="url"
                value={providerBaseUrl}
                onChange={(event) => setProviderBaseUrl(event.target.value)}
                required
              />
            </label>
            <label>
              模型
              <input
                value={providerModel}
                onChange={(event) => setProviderModel(event.target.value)}
                required
              />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={providerKey}
                onChange={(event) => setProviderKey(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit">
              <Plus size={16} />
              添加配置
            </button>
          </form>
          <div className="settings-provider-list">
            {providers.map((provider) => (
              <div className="settings-provider" key={provider.id}>
                <strong>{provider.name}</strong>
                <small>
                  {provider.kind} · {provider.model}
                </small>
                <span>{provider.apiKeySet ? '密钥已加密保存' : '未设置密钥'}</span>
              </div>
            ))}
            {providers.length === 0 && <p className="empty-state">还没有模型配置。</p>}
          </div>
        </section>
        <section className="settings-panel">
          <div className="section-heading">
            <div>
              <h2>本地 PIN</h2>
              <span>{pinEnabled ? '已启用' : '默认免登录'}</span>
            </div>
          </div>
          <form className="settings-provider-form" onSubmit={(event) => void savePin(event)}>
            <label>
              设置 4–12 位数字 PIN
              <input
                inputMode="numeric"
                maxLength={12}
                minLength={4}
                onChange={(event) => setPin(event.target.value)}
                pattern="[0-9]{4,12}"
                type="password"
                value={pin}
              />
            </label>
            <button className="secondary-button" disabled={pin.length < 4} type="submit">
              <KeyRound size={16} /> 启用或更换 PIN
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
