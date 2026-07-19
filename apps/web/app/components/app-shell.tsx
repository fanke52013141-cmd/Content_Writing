'use client';

/* eslint-disable @typescript-eslint/no-unused-expressions */

import {
  Archive,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FileClock,
  FileText,
  Flame,
  FolderOpen,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Plus,
  Settings,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import { ApiStatus } from './api-status';
import { AccountWorkspace } from './account-workspace';
import { ProjectWorkspace } from './project-workspace';
import { MaterialWorkspace } from './material-workspace';
import { OutlineWorkspace } from './outline-workspace';
import { ArticleWorkspace } from './article-workspace';
import { TopicWorkspace } from './topic-workspace';
import { DiscoveryWorkspace } from './discovery-workspace';
import { SettingsWorkspace } from './settings-workspace';

interface NavigationItem {
  label: string;
  icon: LucideIcon;
  href: string;
}

const navigation: readonly NavigationItem[] = [
  { label: '创作首页', icon: LayoutDashboard, href: '/' },
  { label: '账号定位', icon: CircleUserRound, href: '/accounts' },
  { label: '创作项目', icon: FolderKanban, href: '/projects' },
  { label: '热点中心', icon: Flame, href: '/discovery' },
  { label: '选题库', icon: Lightbulb, href: '/topics' },
  { label: '素材库', icon: FolderOpen, href: '/materials' },
  { label: '文章框架', icon: FileText, href: '/outlines' },
  { label: '我的文章', icon: BookOpenText, href: '/articles' },
  { label: 'Prompt 管理', icon: WandSparkles, href: '/settings' },
  { label: '导出历史', icon: FileClock, href: '#' },
];

const workflows = [
  { title: '从选题开始', description: '把一个想法发展成完整文章', icon: Lightbulb },
  { title: '从热点开始', description: '筛选与你账号匹配的内容机会', icon: Flame },
  { title: '从素材开始', description: '整理已有资料并形成创作框架', icon: Archive },
];

export function AppShell({
  surface = 'home',
}: {
  surface?:
    | 'home'
    | 'accounts'
    | 'projects'
    | 'discovery'
    | 'topics'
    | 'materials'
    | 'outlines'
    | 'articles'
    | 'settings';
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={collapsed ? 'app-shell app-shell--collapsed' : 'app-shell'}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          {!collapsed && <span className="brand__name">墨流</span>}
          <button
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            className="icon-button sidebar__toggle"
            onClick={() => setCollapsed((value) => !value)}
            type="button"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <button className="primary-button sidebar__create" type="button">
          <Plus aria-hidden="true" size={17} />
          {!collapsed && '新建创作'}
        </button>

        <nav className="navigation">
          {navigation.map(({ label, icon: Icon, href }) => {
            const active =
              (surface === 'home' && label === '创作首页') ||
              (surface === 'accounts' && label === '账号定位') ||
              (surface === 'projects' && label === '创作项目') ||
              (surface === 'discovery' && label === '热点中心') ||
              (surface === 'topics' && label === '选题库') ||
              (surface === 'materials' && label === '素材库') ||
              (surface === 'outlines' && label === '文章框架') ||
              (surface === 'articles' && label === '我的文章');
            surface === 'settings' && label === 'Prompt 管理';
            return (
              <a
                aria-current={active ? 'page' : undefined}
                className={
                  active ? 'navigation__item navigation__item--active' : 'navigation__item'
                }
                href={href}
                key={label}
                title={collapsed ? label : undefined}
              >
                <Icon aria-hidden="true" size={18} />
                {!collapsed && <span>{label}</span>}
              </a>
            );
          })}
        </nav>

        <a className="navigation__item sidebar__settings" href="/settings">
          <Settings aria-hidden="true" size={18} />
          {!collapsed && <span>设置</span>}
        </a>
      </aside>

      <main className="workspace">
        <header className="workspace__header">
          <button aria-label="打开导航" className="icon-button compact-menu" type="button">
            <Menu size={18} />
          </button>
          <ApiStatus />
        </header>

        <div
          className={
            surface === 'accounts' ||
            surface === 'projects' ||
            surface === 'discovery' ||
            surface === 'topics' ||
            surface === 'materials' ||
            surface === 'outlines' ||
            surface === 'articles' ||
            surface === 'settings'
              ? 'workspace__content workspace__content--wide'
              : 'workspace__content'
          }
        >
          {surface === 'accounts' ? (
            <AccountWorkspace />
          ) : surface === 'projects' ? (
            <ProjectWorkspace />
          ) : surface === 'discovery' ? (
            <DiscoveryWorkspace />
          ) : surface === 'topics' ? (
            <TopicWorkspace />
          ) : surface === 'materials' ? (
            <MaterialWorkspace />
          ) : surface === 'outlines' ? (
            <OutlineWorkspace />
          ) : surface === 'articles' ? (
            <ArticleWorkspace />
          ) : surface === 'settings' ? (
            <SettingsWorkspace />
          ) : (
            <>
              <section className="welcome" aria-labelledby="welcome-title">
                <p className="eyebrow">你的本地内容工作台</p>
                <h1 id="welcome-title">今天想写点什么？</h1>
                <p className="welcome__description">
                  从一个想法、热点或已有素材开始，AI 会陪你完成框架、文章、评审与改写。
                </p>
              </section>

              <section aria-labelledby="create-heading">
                <div className="section-heading">
                  <h2 id="create-heading">开始创作</h2>
                  <span>所有内容默认保存在本机</span>
                </div>
                <div className="workflow-grid">
                  {workflows.map(({ title, description, icon: Icon }) => (
                    <button className="workflow-card" key={title} type="button">
                      <span className="workflow-card__icon">
                        <Icon aria-hidden="true" size={20} />
                      </span>
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <ChevronRight aria-hidden="true" className="workflow-card__arrow" size={17} />
                    </button>
                  ))}
                </div>
              </section>

              <section aria-labelledby="recent-heading">
                <div className="section-heading">
                  <h2 id="recent-heading">最近创作</h2>
                </div>
                <div className="empty-state">
                  <BookOpenText aria-hidden="true" size={28} />
                  <strong>还没有创作项目</strong>
                  <p>完成账号定位后，从第一个选题开始吧。</p>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <aside className="ai-panel" aria-label="AI 助手">
        <div className="ai-panel__heading">
          <span className="ai-panel__spark">
            <Sparkles aria-hidden="true" size={16} />
          </span>
          <div>
            <strong>AI 助手</strong>
            <small>等待创作上下文</small>
          </div>
        </div>
        <div className="ai-panel__empty">
          <Sparkles aria-hidden="true" size={24} />
          <p>进入一个创作项目后，这里会显示当前阶段可用的 AI 能力。</p>
        </div>
        <div className="ai-panel__privacy">本地优先 · AI 调用由你配置</div>
      </aside>
    </div>
  );
}
