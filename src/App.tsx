// 应用壳（TenantShell，v0.2 §3）：Identity 登录 → 选租户（权威 memberships）
// → TenantContext 会话。主导航六入口 + 底部设置；平台运营面在 /ops（双 shell）。
// SaaS 化：侧边栏分组 + 图标、当前项左侧高亮条（不只靠颜色）、二级页面包屑。

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getHealth } from './api/client'
import { useSession, SessionProvider } from './session/SessionContext'
import { ROLE_LABELS } from './session/permissions'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import type { PageKey } from './state/AppStateContext'
import { Badge, Button, Select } from './components/ui'
import { ToastHost } from './components/Toast'
import {
  IconChevronRight, IconGlobe, IconLayout, IconListCheck, IconProducts, IconRobot, IconSettings, IconTarget,
} from './components/icons'
import { LoginModal } from './components/LoginModal'
import { OidcCallback } from './components/OidcCallback'
import { OverviewPage } from './pages/OverviewPage'
import { AiWorkspacePage } from './pages/AiWorkspacePage'
import { ProductsPage } from './pages/ProductsPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { EvidencePage } from './pages/EvidencePage'
import { SitesPage, SiteDetailPage } from './pages/SitesPage'
import { OptimizationPage } from './pages/OptimizationPage'
import { TasksPage } from './pages/TasksPage'
import { SettingsPage } from './pages/SettingsPage'

// v1.8 信息架构（22 §2 交付切片）：六入口不变，按工作域分组展示。
interface NavItem { key: PageKey; label: string; desc: string; icon: ReactNode; tag?: string }
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: '总览',
    items: [
      { key: 'overview', label: '工作台', desc: '待办 · 进行中 · 近期结果', icon: <IconLayout size={15} />, tag: 'M2b' },
      { key: 'ai', label: 'AI 工作区', desc: '独立工作区 · 按阶段接入', icon: <IconRobot size={15} />, tag: '接入中' },
    ],
  },
  {
    label: '商品与知识',
    items: [
      { key: 'products', label: '商品目录', desc: '商品 · 知识 · 证据 · 问题', icon: <IconProducts size={15} /> },
    ],
  },
  {
    label: '站点与渠道',
    items: [
      { key: 'sites', label: '站点列表', desc: '站点 · 连接状态', icon: <IconGlobe size={15} /> },
    ],
  },
  {
    label: '优化中心',
    items: [
      { key: 'optimization', label: '问题与提案', desc: '问题 · 提案 · 效果', icon: <IconTarget size={15} /> },
    ],
  },
  {
    label: '任务中心',
    items: [
      { key: 'tasks', label: '任务与执行', desc: '任务 · 分项 · 恢复', icon: <IconListCheck size={15} /> },
    ],
  },
]

const FOOTER_NAV: { key: PageKey; label: string; desc: string; icon: ReactNode }[] = [
  { key: 'settings', label: '设置', desc: '身份 · 成员 · 接口', icon: <IconSettings size={15} /> },
]

const PAGE_META = new Map([
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...FOOTER_NAV,
  { key: 'product-detail' as PageKey, label: '商品详情', desc: '概览 · 知识与规格 · 证据 · 问题 · 变更' },
  { key: 'site-detail' as PageKey, label: '站点详情', desc: '概览 · 商品 · 检查 · 发布 · 连接' },
  { key: 'task-detail' as PageKey, label: '任务详情', desc: '阶段 · 分项 · 副作用 · 恢复' },
].map((i) => [i.key, i]))

// 二级页面包屑（父级可点击返回）
const PARENT_CRUMB: Partial<Record<PageKey, { label: string; page: PageKey }>> = {
  'product-detail': { label: '商品与知识', page: 'products' },
  evidence: { label: '商品与知识', page: 'products' },
  'site-detail': { label: '站点与渠道', page: 'sites' },
  'task-detail': { label: '任务中心', page: 'tasks' },
}

function Shell() {
  const { active, memberships, selectTenant, logout, identityUser, booted } = useSession()
  const { page, navigate, health, setHealth, resetBusinessState } = useAppState()
  const [showLogin, setShowLogin] = useState(false)

  // 未登录保护：无身份会话或未选择租户时，自动弹出登录框
  useEffect(() => {
    if (booted && (!identityUser || !active)) setShowLogin(true)
  }, [booted, identityUser, active])

  // 身份会话消失（登出/失效）→ 清空全部内存态业务记录
  useEffect(() => {
    if (booted && !identityUser) resetBusinessState()
  }, [booted, identityUser, resetBusinessState])

  useEffect(() => {
    let alive = true
    const ping = async () => {
      const started = performance.now()
      try {
        await getHealth()
        if (alive) setHealth({ ok: true, ms: Math.round(performance.now() - started), checkedAt: Date.now() })
      } catch {
        if (alive) setHealth({ ok: false, ms: Math.round(performance.now() - started), checkedAt: Date.now() })
      }
    }
    void ping()
    const timer = setInterval(ping, 10000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [setHealth])

  // ---- 未登录门禁：不渲染任何业务壳/导航/页面，只渲染登录弹窗 ----
  if (!booted) {
    return <div className="boot-screen">检测会话中…</div>
  }
  if (!identityUser || !active) {
    return (
      <div className="gate-screen">
        <div className="gate-brand">
          <span className="brand-mark">PK</span>
          <strong>Platform Console</strong>
          <p className="muted">租户商品知识与 SEO 优化平台 · 请登录后继续</p>
        </div>
        <LoginModal
          startStep={identityUser && !active ? 'select' : 'login'}
          onClose={() => setShowLogin(false)}
        />
        {(!showLogin) && (
          <button className="btn btn-primary" onClick={() => setShowLogin(true)}>登录</button>
        )}
      </div>
    )
  }

  const meta = PAGE_META.get(page)
  const crumb = PARENT_CRUMB[page]
  const isRelated = (item: PageKey, current: PageKey) =>
    current === item
    || (current === 'product-detail' && item === 'products')
    || (current === 'evidence' && item === 'products')
    || (current === 'site-detail' && item === 'sites')
    || (current === 'task-detail' && item === 'tasks')

  const renderNavItem = (item: { key: PageKey; label: string; desc: string; icon: ReactNode; tag?: string }) => (
    <button
      key={item.key}
      className={`nav-item ${isRelated(item.key, page) ? 'active' : ''}`}
      onClick={() => navigate(item.key)}
      title={item.desc}
      aria-current={isRelated(item.key, page) ? 'page' : undefined}
    >
      <span className="nav-item-main">
        <span className="nav-item-icon" aria-hidden>{item.icon}</span>
        <span className="nav-item-text">
          {item.label}
          {item.tag && <em className="nav-tag">{item.tag}</em>}
        </span>
      </span>
    </button>
  )

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">PK</span>
          <div>
            <strong>Platform Console</strong>
            <div className="brand-sub">租户商品知识与 SEO 优化</div>
          </div>
        </div>
        {active && (
          <div className="tenant-box">
            <span className="nav-group-label">当前租户</span>
            <Select value={active.tenantId} onChange={(e) => {
              const m = memberships.find((x) => x.tenant_id === e.target.value)
              if (m) void selectTenant(m.membership_id)
            }}>
              {memberships.some((m) => m.tenant_id === active.tenantId)
                ? null
                : <option value={active.tenantId}>{active.tenantName}</option>}
              {memberships.map((m) => (
                <option key={m.membership_id} value={m.tenant_id}>{m.tenant_name}</option>
              ))}
            </Select>
            <div className="muted">{active.role}</div>
          </div>
        )}
        <nav className="nav-groups" aria-label="主导航">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items.map(renderNavItem)}
            </div>
          ))}
        </nav>
        <nav className="nav-groups footer" aria-label="底部导航">
          <div className="nav-group">
            {FOOTER_NAV.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${page === item.key ? 'active' : ''}`}
                onClick={() => navigate(item.key)}
                title={item.desc}
                aria-current={page === item.key ? 'page' : undefined}
              >
                <span className="nav-item-main">
                  <span className="nav-item-icon" aria-hidden>{item.icon}</span>
                  <span className="nav-item-text">{item.label}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div className="sidebar-foot">
          platform-backend（Go）<br />devkit v1.8 · 31 个 /v1 操作
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            {crumb && (
              <nav className="breadcrumb" aria-label="所在位置">
                <button className="crumb-link" onClick={() => navigate(crumb.page)}>{crumb.label}</button>
                <span className="crumb-sep" aria-hidden><IconChevronRight size={11} /></span>
                <span className="crumb-current" aria-current="page">{meta?.label}</span>
              </nav>
            )}
            <h1>{meta?.label ?? '商品与知识'}</h1>
            <p className="topbar-sub">{meta?.desc}</p>
          </div>
          <div className="topbar-right">
            <span className="health-pill" title={`最近巡检 ${health ? new Date(health.checkedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}`}>
              <span className={`health-dot ${health ? (health.ok ? 'up' : 'down') : ''}`} />
              {health ? (health.ok ? `服务正常 · ${health.ms}ms` : '服务不可达') : '检测中…'}
            </span>
            {active ? (
              <>
                <Badge tone="info">{ROLE_LABELS[active.role as keyof typeof ROLE_LABELS] ?? active.role}</Badge>
                <span className="muted mono">{active.tenantName}</span>
                <Button variant="ghost" onClick={() => navigate('settings')}>设置</Button>
                <Button variant="ghost" onClick={logout}>退出</Button>
              </>
            ) : (
              <>
                <Badge tone="warn">未选择租户</Badge>
                <Button variant="primary" onClick={() => setShowLogin((v) => !v)}>登录</Button>
              </>
            )}
          </div>
        </header>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
        <main className="content">
          {page === 'overview' && <OverviewPage />}
          {page === 'ai' && <AiWorkspacePage />}
          {page === 'products' && <ProductsPage />}
          {page === 'product-detail' && <ProductDetailPage />}
          {page === 'evidence' && <EvidencePage />}
          {page === 'sites' && <SitesPage />}
          {page === 'site-detail' && <SiteDetailPage />}
          {page === 'optimization' && <OptimizationPage />}
          {page === 'tasks' && <TasksPage />}
          {page === 'task-detail' && <TasksPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
      <ToastHost />
    </div>
  )
}

export default function App() {
  // OIDC 回调路径：在门禁之外独立处理（换取身份会话后整页进入应用）
  if (window.location.pathname === '/oidc-callback') {
    return <OidcCallbackRoute />
  }
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}

function OidcCallbackRoute() {
  return (
    <SessionProvider>
      <OidcCallback />
    </SessionProvider>
  )
}
