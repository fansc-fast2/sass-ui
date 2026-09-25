// 应用壳（TenantShell，19 §2）：侧栏顶部当前租户/切换，主导航六入口，
// 底部导航设置；顶栏健康灯与账号。租户是全局安全边界，切换立即取消旧请求。

import { useEffect } from 'react'
import { getHealth } from './api/client'
import { useSession } from './session/SessionContext'
import { ROLE_LABELS } from './session/permissions'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import type { PageKey } from './state/AppStateContext'
import { useTenantRegistry } from './tenants/registry'
import { Badge, Button, Select } from './components/ui'
import { OverviewPage } from './pages/OverviewPage'
import { AiWorkspacePage } from './pages/AiWorkspacePage'
import { ProductsPage } from './pages/ProductsPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { EvidencePage } from './pages/EvidencePage'
import { SitesPage, SiteDetailPage } from './pages/SitesPage'
import { OptimizationPage } from './pages/OptimizationPage'
import { TasksPage } from './pages/TasksPage'
import { SettingsPage } from './pages/SettingsPage'

// v1.6 信息架构（22 §2 交付切片 + contracts/navigation.json）：
// M2a 核心入口在前（商品/站点/优化/任务），M2b 体验增强（工作台/AI）在后并可按能力隐藏；
// 关闭工作台时默认进入首个可访问的已实现业务页。
const PRIMARY_NAV: { key: PageKey; label: string; desc: string; tag?: string }[] = [
  { key: 'products', label: '商品与知识', desc: '商品目录 · 知识 · 证据' },
  { key: 'sites', label: '站点与渠道', desc: '站点 · 连接状态' },
  { key: 'optimization', label: '优化中心', desc: '问题 · 提案 · 效果' },
  { key: 'tasks', label: '任务中心', desc: '任务 · 分项 · 恢复' },
  { key: 'overview', label: '工作台', desc: '待办 · 进行中 · 近期结果', tag: 'M2b' },
  { key: 'ai', label: 'AI 工作区', desc: '独立工作区 · 按阶段接入', tag: '接入中' },
]

const FOOTER_NAV: { key: PageKey; label: string; desc: string; tag?: string }[] = [
  { key: 'settings', label: '设置', desc: '租户 · 凭据 · 接口' },
]

const PAGE_META = new Map([...PRIMARY_NAV, ...FOOTER_NAV, {
  key: 'product-detail' as PageKey, label: '商品详情', desc: '概览 · 知识与规格 · 证据 · 问题 · 变更',
}, {
  key: 'site-detail' as PageKey, label: '站点详情', desc: '概览 · 商品 · 检查 · 发布 · 连接',
}].map((i) => [i.key, i]))

function Shell() {
  const { session, save, clear } = useSession()
  const { tenants, upsert } = useTenantRegistry()
  const { page, navigate, health, setHealth } = useAppState()

  // 健康轮询：顶栏指示灯
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

  // 当前会话的租户若不在注册表（历史 localStorage 凭据），自动补登记
  useEffect(() => {
    if (!session) return
    if (!tenants.some((t) => t.tenant === session.tenant)) {
      upsert({ tenant: session.tenant, actor: session.actor, role: session.role, sites: session.sites })
    }
  }, [session, tenants, upsert])

  const switchTenant = (tenant: string) => {
    const entry = tenants.find((t) => t.tenant === tenant)
    if (!entry) return
    upsert(entry) // 刷新 lastUsedAt
    save({ tenant: entry.tenant, actor: entry.actor, role: entry.role, sites: entry.sites })
  }

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
        {session && (
          <div className="tenant-box">
            <span className="nav-group-label">当前租户</span>
            <Select value={session.tenant} onChange={(e) => switchTenant(e.target.value)}>
              {tenants.some((t) => t.tenant === session.tenant)
                ? null
                : <option value={session.tenant}>{session.tenant}</option>}
              {tenants.map((t) => (
                <option key={t.tenant} value={t.tenant}>{t.tenant}</option>
              ))}
            </Select>
            <div className="muted">{session.actor} · {ROLE_LABELS[session.role]}</div>
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
          platform-backend（Go）<br />devkit v1.6 · 31 个 /v1 操作
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{meta?.label ?? '工作台'}</h1>
            <p className="topbar-sub">{meta?.desc}</p>
          </div>
          <div className="topbar-right">
            <span className="health-pill" title={`最近巡检 ${health ? new Date(health.checkedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}`}>
              <span className={`health-dot ${health ? (health.ok ? 'up' : 'down') : ''}`} />
              {health ? (health.ok ? `服务正常 · ${health.ms}ms` : '服务不可达') : '检测中…'}
            </span>
            {session ? (
              <>
                <Badge tone="info">{ROLE_LABELS[session.role]}</Badge>
                <span className="muted mono">{session.tenant} / {session.actor}</span>
                <Button variant="ghost" onClick={() => navigate('settings')}>设置</Button>
                <Button variant="ghost" onClick={clear}>退出</Button>
              </>
            ) : (
              <>
                <Badge tone="warn">未进入租户</Badge>
                <Button variant="primary" onClick={() => navigate('settings')}>去设置</Button>
              </>
            )}
          </div>
        </header>
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
