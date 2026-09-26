// 应用壳（TenantShell，v0.2 §3）：Identity 登录 → 选租户（权威 memberships）
// → TenantContext 会话。主导航六入口 + 底部设置；平台运营面在 /ops（双 shell）。

import { useEffect, useState } from 'react'
import { getHealth } from './api/client'
import { useSession } from './session/SessionContext'
import { ROLE_LABELS } from './session/permissions'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import type { PageKey } from './state/AppStateContext'
import { Badge, Button, Select } from './components/ui'
import { LoginFlow } from './components/LoginFlow'
import { OverviewPage } from './pages/OverviewPage'
import { AiWorkspacePage } from './pages/AiWorkspacePage'
import { ProductsPage } from './pages/ProductsPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { EvidencePage } from './pages/EvidencePage'
import { SitesPage, SiteDetailPage } from './pages/SitesPage'
import { OptimizationPage } from './pages/OptimizationPage'
import { TasksPage } from './pages/TasksPage'
import { SettingsPage } from './pages/SettingsPage'

// v1.8 信息架构（22 §2 交付切片）：M2a 核心入口在前，M2b 体验增强后移。
const PRIMARY_NAV: { key: PageKey; label: string; desc: string; tag?: string }[] = [
  { key: 'products', label: '商品与知识', desc: '商品目录 · 知识 · 证据' },
  { key: 'sites', label: '站点与渠道', desc: '站点 · 连接状态' },
  { key: 'optimization', label: '优化中心', desc: '问题 · 提案 · 效果' },
  { key: 'tasks', label: '任务中心', desc: '任务 · 分项 · 恢复' },
  { key: 'overview', label: '工作台', desc: '待办 · 进行中 · 近期结果', tag: 'M2b' },
  { key: 'ai', label: 'AI 工作区', desc: '独立工作区 · 按阶段接入', tag: '接入中' },
]

const FOOTER_NAV: { key: PageKey; label: string; desc: string; tag?: string }[] = [
  { key: 'settings', label: '设置', desc: '身份 · 成员 · 接口' },
]

const PAGE_META = new Map([...PRIMARY_NAV, ...FOOTER_NAV, {
  key: 'product-detail' as PageKey, label: '商品详情', desc: '概览 · 知识与规格 · 证据 · 问题 · 变更',
}, {
  key: 'site-detail' as PageKey, label: '站点详情', desc: '概览 · 商品 · 检查 · 发布 · 连接',
}].map((i) => [i.key, i]))

function Shell() {
  const { active, memberships, selectTenant, logout } = useSession()
  const { page, navigate, health, setHealth } = useAppState()
  const [showLogin, setShowLogin] = useState(false)

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

  const meta = PAGE_META.get(page)

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
        <nav className="nav-groups">
          <div className="nav-group">
            {PRIMARY_NAV.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${page === item.key || (page === 'product-detail' && item.key === 'products') || (page === 'site-detail' && item.key === 'sites') ? 'active' : ''}`}
                onClick={() => navigate(item.key)}
              >
                <span>{item.label}{item.tag && <em className="nav-tag">{item.tag}</em>}</span>
                <em>{item.desc}</em>
              </button>
            ))}
          </div>
        </nav>
        <nav className="nav-groups footer">
          <div className="nav-group">
            {FOOTER_NAV.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${page === item.key ? 'active' : ''}`}
                onClick={() => navigate(item.key)}
              >
                <span>{item.label}</span>
                <em>{item.desc}</em>
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
          <div>
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
        {showLogin && (
          <div className="cred-drawer">
            <LoginFlow onDone={() => setShowLogin(false)} />
          </div>
        )}
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
    </div>
  )
}

export default function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  )
}
