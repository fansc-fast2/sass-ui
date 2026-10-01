// 应用壳（TenantShell，v0.2 §3）：Identity 登录 → 选租户（权威 memberships）
// → TenantContext 会话。主导航六入口 + 底部设置；平台运营面在 /ops（双 shell）。
// SaaS 化：侧边栏分组 + 图标、当前项左侧高亮条（不只靠颜色）、二级页面包屑。
// i18n：导航/标题等 UI 文案全部经 t() 双语化（key 见 src/i18n/zh.ts）。

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getHealth } from './api/client'
import { useLang } from './i18n'
import type { MsgKey } from './i18n'
import { langTag } from './i18n'
import { useSession, SessionProvider } from './session/SessionContext'
import { roleLabel } from './session/permissions'
import { AppStateProvider, useAppState } from './state/AppStateContext'
import type { PageKey } from './state/AppStateContext'
import { Badge, Button, Select } from './components/ui'
import { ToastHost } from './components/Toast'
import { LanguageSelect } from './components/LanguageSelect'
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
// label/desc 存字典 key，渲染时经 t() 取当前语言文案。
interface NavItem { key: PageKey; labelKey: MsgKey; descKey: MsgKey; icon: ReactNode; tagKey?: MsgKey; tag?: string }
const NAV_GROUPS: { labelKey: MsgKey; items: NavItem[] }[] = [
  {
    labelKey: 'navGroupOverview',
    items: [
      { key: 'overview', labelKey: 'navOverview', descKey: 'navOverviewDesc', icon: <IconLayout size={15} />, tag: 'M2b' },
      { key: 'ai', labelKey: 'navAi', descKey: 'navAiDesc', icon: <IconRobot size={15} />, tagKey: 'navTagIntegrating' },
    ],
  },
  {
    labelKey: 'navGroupProducts',
    items: [
      { key: 'products', labelKey: 'navProducts', descKey: 'navProductsDesc', icon: <IconProducts size={15} /> },
    ],
  },
  {
    labelKey: 'navGroupSites',
    items: [
      { key: 'sites', labelKey: 'navSites', descKey: 'navSitesDesc', icon: <IconGlobe size={15} /> },
    ],
  },
  {
    labelKey: 'navGroupOptimization',
    items: [
      { key: 'optimization', labelKey: 'navOptimization', descKey: 'navOptimizationDesc', icon: <IconTarget size={15} /> },
    ],
  },
  {
    labelKey: 'navGroupTasks',
    items: [
      { key: 'tasks', labelKey: 'navTasks', descKey: 'navTasksDesc', icon: <IconListCheck size={15} /> },
    ],
  },
]

const FOOTER_NAV: { key: PageKey; labelKey: MsgKey; descKey: MsgKey; icon: ReactNode }[] = [
  { key: 'settings', labelKey: 'navSettings', descKey: 'navSettingsDesc', icon: <IconSettings size={15} /> },
]

const PAGE_META = new Map([
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...FOOTER_NAV,
  { key: 'product-detail' as PageKey, labelKey: 'pageProductDetail' as MsgKey, descKey: 'pageProductDetailDesc' as MsgKey, icon: null as ReactNode | null },
  { key: 'site-detail' as PageKey, labelKey: 'pageSiteDetail' as MsgKey, descKey: 'pageSiteDetailDesc' as MsgKey, icon: null as ReactNode | null },
  { key: 'task-detail' as PageKey, labelKey: 'pageTaskDetail' as MsgKey, descKey: 'pageTaskDetailDesc' as MsgKey, icon: null as ReactNode | null },
].map((i) => [i.key, i]))

// 二级页面包屑（父级可点击返回）
const PARENT_CRUMB: Partial<Record<PageKey, { labelKey: MsgKey; page: PageKey }>> = {
  'product-detail': { labelKey: 'navGroupProducts', page: 'products' },
  evidence: { labelKey: 'navGroupProducts', page: 'products' },
  'site-detail': { labelKey: 'navGroupSites', page: 'sites' },
  'task-detail': { labelKey: 'navGroupTasks', page: 'tasks' },
}

function Shell() {
  const { t, lang } = useLang()
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
    return <div className="boot-screen">{t('bootScreen')}</div>
  }
  if (!identityUser || !active) {
    return (
      <div className="gate-screen">
        <div className="gate-brand">
          <span className="brand-mark">PK</span>
          <strong>Platform Console</strong>
          <p className="muted">{t('gateTagline')}</p>
        </div>
        <LoginModal
          startStep={identityUser && !active ? 'select' : 'login'}
          onClose={() => setShowLogin(false)}
        />
        {(!showLogin) && (
          <button className="btn btn-primary" onClick={() => setShowLogin(true)}>{t('login')}</button>
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

  const renderNavItem = (item: { key: PageKey; labelKey: MsgKey; descKey: MsgKey; icon: ReactNode; tagKey?: MsgKey; tag?: string }) => (
    <button
      key={item.key}
      className={`nav-item ${isRelated(item.key, page) ? 'active' : ''}`}
      onClick={() => navigate(item.key)}
      title={t(item.descKey)}
      aria-current={isRelated(item.key, page) ? 'page' : undefined}
    >
      <span className="nav-item-main">
        <span className="nav-item-icon" aria-hidden>{item.icon}</span>
        <span className="nav-item-text">
          {t(item.labelKey)}
          {item.tagKey && <em className="nav-tag">{t(item.tagKey)}</em>}
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
            <div className="brand-sub">{t('brandSub')}</div>
          </div>
        </div>
        {active && (
          <div className="tenant-box">
            <span className="nav-group-label">{t('currentTenant')}</span>
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
        <nav className="nav-groups" aria-label={t('mainNavAria')}>
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.labelKey}>
              <div className="nav-group-label">{t(group.labelKey)}</div>
              {group.items.map(renderNavItem)}
            </div>
          ))}
        </nav>
        <nav className="nav-groups footer" aria-label={t('footerNavAria')}>
          <div className="nav-group">
            {FOOTER_NAV.map((item) => (
              <button
                key={item.key}
                className={`nav-item ${page === item.key ? 'active' : ''}`}
                onClick={() => navigate(item.key)}
                title={t(item.descKey)}
                aria-current={page === item.key ? 'page' : undefined}
              >
                <span className="nav-item-main">
                  <span className="nav-item-icon" aria-hidden>{item.icon}</span>
                  <span className="nav-item-text">{t(item.labelKey)}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>
        <div className="sidebar-foot">
          platform-backend（Go）<br />{t('sidebarFootLine2')}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            {crumb && (
              <nav className="breadcrumb" aria-label={t('breadcrumbAria')}>
                <button className="crumb-link" onClick={() => navigate(crumb.page)}>{t(crumb.labelKey)}</button>
                <span className="crumb-sep" aria-hidden><IconChevronRight size={11} /></span>
                <span className="crumb-current" aria-current="page">{meta ? t(meta.labelKey) : ''}</span>
              </nav>
            )}
            <h1>{meta ? t(meta.labelKey) : t('navGroupProducts')}</h1>
            <p className="topbar-sub">{meta ? t(meta.descKey) : ''}</p>
          </div>
          <div className="topbar-right">
            <LanguageSelect compact />
            <span
              className="health-pill"
              title={t('healthTitle', { time: health ? new Date(health.checkedAt).toLocaleTimeString(langTag(lang), { hour12: false }) : '—' })}
            >
              <span className={`health-dot ${health ? (health.ok ? 'up' : 'down') : ''}`} />
              {health ? (health.ok ? t('healthOk', { ms: health.ms }) : t('healthDown')) : t('healthChecking')}
            </span>
            {active ? (
              <>
                <Badge tone="info">{roleLabel(t, active.role)}</Badge>
                <span className="muted mono">{active.tenantName}</span>
                <Button variant="ghost" onClick={() => navigate('settings')}>{t('navSettings')}</Button>
                <Button variant="ghost" onClick={logout}>{t('logout')}</Button>
              </>
            ) : (
              <>
                <Badge tone="warn">{t('noTenantBadge')}</Badge>
                <Button variant="primary" onClick={() => setShowLogin((v) => !v)}>{t('login')}</Button>
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
