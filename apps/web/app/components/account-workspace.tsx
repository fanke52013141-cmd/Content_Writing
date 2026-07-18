'use client';

import type {
  Account,
  AccountProfileVersion,
  CreateAccountProfileDraft,
} from '@content-writing/contracts';
import { ArchiveRestore, Check, CircleAlert, Plus, Save } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3100';

const emptyProfile: CreateAccountProfileDraft = {
  positioningStatement: '',
  targetAudience: '',
  valueProposition: '',
  contentPillars: [],
  toneKeywords: [],
  writingStyle: '',
  contentBoundaries: '',
  versionNote: '',
};

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

function profileInput(profile: AccountProfileVersion): CreateAccountProfileDraft {
  return {
    positioningStatement: profile.positioningStatement,
    targetAudience: profile.targetAudience,
    valueProposition: profile.valueProposition,
    contentPillars: profile.contentPillars,
    toneKeywords: profile.toneKeywords,
    writingStyle: profile.writingStyle,
    contentBoundaries: profile.contentBoundaries,
    versionNote: profile.versionNote,
  };
}

export function AccountWorkspace() {
  const [accounts, setAccounts] = useState<readonly Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [profiles, setProfiles] = useState<readonly AccountProfileVersion[]>([]);
  const [profile, setProfile] = useState<CreateAccountProfileDraft>(emptyProfile);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [accountName, setAccountName] = useState('');
  const [accountDescription, setAccountDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId],
  );
  const activeProfile = profiles.find((item) => item.status === 'active') ?? null;

  const loadAccounts = async (preferredId?: string): Promise<void> => {
    const nextAccounts = await request<readonly Account[]>('/api/v1/accounts');
    setAccounts(nextAccounts);
    setSelectedAccountId((current) => preferredId ?? current ?? nextAccounts[0]?.id ?? '');
    if (!preferredId && !selectedAccountId && nextAccounts[0]) {
      setSelectedAccountId(nextAccounts[0].id);
    }
  };

  const loadProfiles = async (accountId: string): Promise<void> => {
    const nextProfiles = await request<readonly AccountProfileVersion[]>(
      `/api/v1/accounts/${accountId}/profile-versions`,
    );
    setProfiles(nextProfiles);
    const editable = nextProfiles.find(
      (item) => item.status === 'draft' && item.source === 'manual',
    );
    if (editable) {
      setEditingProfileId(editable.id);
      setProfile(profileInput(editable));
    } else {
      setEditingProfileId(null);
      setProfile(emptyProfile);
    }
  };

  useEffect(() => {
    void loadAccounts().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '无法读取账号');
    });
  }, []);

  useEffect(() => {
    if (!selectedAccountId) {
      setProfiles([]);
      return;
    }
    void loadProfiles(selectedAccountId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '无法读取定位版本');
    });
  }, [selectedAccountId]);

  const createAccount = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await request<Account>('/api/v1/accounts', {
        method: 'POST',
        body: JSON.stringify({ name: accountName, description: accountDescription }),
      });
      setAccountName('');
      setAccountDescription('');
      await loadAccounts(created.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '账号创建失败');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!selectedAccountId) return;
    setBusy(true);
    setError('');
    try {
      const path = editingProfileId
        ? `/api/v1/accounts/${selectedAccountId}/profile-versions/${editingProfileId}`
        : `/api/v1/accounts/${selectedAccountId}/profile-versions`;
      await request<AccountProfileVersion>(path, {
        method: editingProfileId ? 'PUT' : 'POST',
        body: JSON.stringify(profile),
      });
      await loadProfiles(selectedAccountId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '定位草稿保存失败');
    } finally {
      setBusy(false);
    }
  };

  const activateProfile = async (profileId: string): Promise<void> => {
    if (!selectedAccountId) return;
    setBusy(true);
    setError('');
    try {
      await request<AccountProfileVersion>(
        `/api/v1/accounts/${selectedAccountId}/profile-versions/${profileId}/activate`,
        { method: 'POST' },
      );
      await loadProfiles(selectedAccountId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '定位版本启用失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async (): Promise<void> => {
    if (!selectedAccount) return;
    setBusy(true);
    setError('');
    try {
      await request<Account>(`/api/v1/accounts/${selectedAccount.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: selectedAccount.status === 'archived' ? 'active' : 'archived',
        }),
      });
      await loadAccounts(selectedAccount.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '账号状态更新失败');
    } finally {
      setBusy(false);
    }
  };

  const startNewDraft = (): void => {
    setEditingProfileId(null);
    setProfile(activeProfile ? profileInput(activeProfile) : emptyProfile);
  };

  const setText = (field: keyof CreateAccountProfileDraft, value: string): void => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const setList = (field: 'contentPillars' | 'toneKeywords', value: string): void => {
    setProfile((current) => ({
      ...current,
      [field]: value
        .split(/[，,]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    }));
  };

  return (
    <div className="account-workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">长期创作上下文</p>
          <h1>账号定位</h1>
          <p>已启用的定位会进入后续选题、框架、写作和评审，但新草稿不会自动替换它。</p>
        </div>
        {accounts.length > 0 && (
          <select
            aria-label="当前账号"
            className="account-selector"
            onChange={(event) => setSelectedAccountId(event.target.value)}
            value={selectedAccountId}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} · {account.status === 'archived' ? '已归档' : '使用中'}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      )}

      <section className="account-card" aria-labelledby="account-create-heading">
        <div className="section-heading">
          <h2 id="account-create-heading">账号</h2>
          {selectedAccount && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => void toggleArchive()}
              type="button"
            >
              <ArchiveRestore size={15} />
              {selectedAccount.status === 'archived' ? '恢复账号' : '归档账号'}
            </button>
          )}
        </div>
        <form className="inline-form" onSubmit={(event) => void createAccount(event)}>
          <label>
            新账号名称
            <input
              maxLength={80}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="例如：墨流实验室"
              required
              value={accountName}
            />
          </label>
          <label>
            简介
            <input
              maxLength={1000}
              onChange={(event) => setAccountDescription(event.target.value)}
              placeholder="这个账号主要写什么"
              value={accountDescription}
            />
          </label>
          <button className="secondary-button" disabled={busy} type="submit">
            <Plus size={15} /> 添加账号
          </button>
        </form>
      </section>

      {selectedAccount ? (
        <div className="profile-layout">
          <form className="profile-editor" onSubmit={(event) => void saveProfile(event)}>
            <div className="section-heading">
              <div>
                <h2>{editingProfileId ? '编辑定位草稿' : '创建定位草稿'}</h2>
                <span>{editingProfileId ? '自动读取最新可编辑草稿' : '新版本不会自动启用'}</span>
              </div>
              <button className="secondary-button" onClick={startNewDraft} type="button">
                <Plus size={15} /> 新版本
              </button>
            </div>

            <label>
              一句话定位 <em>启用必填</em>
              <textarea
                onChange={(event) => setText('positioningStatement', event.target.value)}
                placeholder="你为谁、解决什么问题"
                value={profile.positioningStatement}
              />
            </label>
            <label>
              目标读者 <em>启用必填</em>
              <textarea
                onChange={(event) => setText('targetAudience', event.target.value)}
                placeholder="读者是谁、处于什么场景"
                value={profile.targetAudience}
              />
            </label>
            <label>
              核心价值 <em>启用必填</em>
              <textarea
                onChange={(event) => setText('valueProposition', event.target.value)}
                placeholder="读者为什么持续关注你"
                value={profile.valueProposition}
              />
            </label>
            <div className="field-grid">
              <label>
                内容支柱
                <input
                  onChange={(event) => setList('contentPillars', event.target.value)}
                  placeholder="选题方法，写作系统"
                  value={profile.contentPillars.join('，')}
                />
              </label>
              <label>
                语气关键词
                <input
                  onChange={(event) => setList('toneKeywords', event.target.value)}
                  placeholder="清晰，克制，实用"
                  value={profile.toneKeywords.join('，')}
                />
              </label>
            </div>
            <label>
              写作偏好
              <textarea
                onChange={(event) => setText('writingStyle', event.target.value)}
                placeholder="结构、段落、叙述和语言偏好"
                value={profile.writingStyle}
              />
            </label>
            <label>
              内容边界
              <textarea
                onChange={(event) => setText('contentBoundaries', event.target.value)}
                placeholder="不写什么、哪些风险必须避免"
                value={profile.contentBoundaries}
              />
            </label>
            <label>
              版本说明
              <input
                onChange={(event) => setText('versionNote', event.target.value)}
                placeholder="这次为什么调整"
                value={profile.versionNote}
              />
            </label>
            <button className="primary-button profile-save" disabled={busy} type="submit">
              <Save size={16} /> 保存草稿
            </button>
          </form>

          <section className="version-panel" aria-labelledby="versions-heading">
            <div className="section-heading">
              <h2 id="versions-heading">定位版本</h2>
              <span>{profiles.length} 个版本</span>
            </div>
            {profiles.length === 0 ? (
              <div className="compact-empty">先保存第一份定位草稿。</div>
            ) : (
              <div className="version-list">
                {profiles.map((item) => (
                  <article className="version-card" key={item.id}>
                    <div>
                      <strong>V{item.versionNumber}</strong>
                      <span className={`version-status version-status--${item.status}`}>
                        {item.status === 'active'
                          ? '当前启用'
                          : item.status === 'draft'
                            ? '草稿'
                            : '历史'}
                      </span>
                    </div>
                    <p>{item.positioningStatement || '尚未填写一句话定位'}</p>
                    <small>{item.versionNote || '无版本说明'}</small>
                    {item.status === 'draft' && (
                      <button
                        className="accept-button"
                        disabled={busy}
                        onClick={() => void activateProfile(item.id)}
                        type="button"
                      >
                        <Check size={14} /> 接受并设为当前定位
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="empty-state">
          <Plus size={28} />
          <strong>先添加一个内容账号</strong>
          <p>一个账号对应一套长期定位，可独立管理多个版本。</p>
        </div>
      )}
    </div>
  );
}
