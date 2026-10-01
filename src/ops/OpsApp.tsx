// 平台运营面（/ops，PaaS v0.2/v0.4 双 shell）：Identity 登录 → ops-context
// 交换（需平台角色授权）。F0 租户目录/生命周期；F1 支持授权；F2 用量费用/审计。
// 与租户业务面逻辑隔离：ops 会话无法调用租户业务 API（aud 隔离）。

import { useEffect, useState } from 'react'
import {
  getOpsToken, identityLogin, opsChangeTenantStatus, opsCreateTenant, opsExchange, opsGetTenant,
  opsListMembers, opsListTenants, opsMe, setOpsToken,
  opsUsageOverview, opsCreateUsageExport, opsDownloadUsageExport, opsSearchAudit,
} from './opsClient'
import type { OpsTenant, UsageRow, AuditEntryView } from './opsClient'
import { Modal } from '../components/Modal'
import { ToastHost } from '../components/Toast'
import { LanguageSelect } from '../components/LanguageSelect'
import { IconChevronLeft, IconPlus } from '../components/icons'
import { useLang } from '../i18n'
import { langTag } from '../i18n'
import type { MsgKey } from '../i18n'
import PluginsPage from './PluginsPage'
import SupportPage from './SupportPage'

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  active: 'ok',
  provisioning: 'warn',
  suspended: 'err',
  closing: 'warn',
  closed: 'neutral',
}

const NEXT_ACTIONS: Record<string, { to: string; labelKey: MsgKey; primary?: boolean; danger?: boolean }[]> = {
  provisioning: [{ to: 'active', labelKey: 'actApproveActivate', primary: true }],
  active: [
    { to: 'suspended', labelKey: 'actSuspend', danger: true },
    { to: 'closing', labelKey: 'actStartClosing', danger: true },
  ],
  suspended: [
    { to: 'active', labelKey: 'actRestore', primary: true },
    { to: 'closing', labelKey: 'actStartClosing', danger: true },
  ],
  closing: [{ to: 'closed', labelKey: 'actCompleteClosing' }],
  closed: [],
}

type OpsPage = 'tenants' | 'plugins' | 'support' | 'usage' | 'audit'

const PAGE_TITLES: Record<OpsPage, MsgKey> = {
  tenants: 'opsNavTenants',
  plugins: 'opsNavPlugins',
  support: 'opsNavSupport',
  usage: 'opsNavUsage',
  audit: 'opsNavAudit',
}

const PAGE_SUBTITLES: Record<OpsPage, MsgKey> = {
  tenants: 'opsSubTenants',
  plugins: 'opsSubPlugins',
  support: 'opsSubSupport',
  usage: 'opsSubUsage',
  audit: 'opsSubAudit',
}

export default function OpsApp() {
  const [user, setUser] = useState<{ subject: string; role: string } | null>(null)
  const [booted, setBooted] = useState(false)

  // 已有会话则恢复（ops 会话存 sessionStorage）
  useEffect(() => {
    void (async () => {
      if (getOpsToken()) {
        try {
          const me = await opsMe()
          setUser({ subject: me.subject, role: me.platform_role })
        } catch {
          setOpsToken(null)
        }
      }
      setBooted(true)
    })()
  }, [])

  if (!booted) return <OpsBoot />
  if (!user) return <OpsLogin onLogin={setUser} />
  return (
    <>
      <OpsShell user={user} onLogout={() => { setOpsToken(null); setUser(null) }} />
      <ToastHost />
    </>
  )
}

function OpsBoot() {
  const { t } = useLang()
  return <div className="ops-boot">{t('bootScreen')}</div>
}

// 登录两步：Identity 登录（dev 适配器）→ 交换 Ops 会话（需平台角色授权）
function OpsLogin({ onLogin }: { onLogin: (u: { subject: string; role: string }) => void }) {
  const { t } = useLang()
  const [login, setLogin] = useState('ops-admin')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const id = await identityLogin(login.trim(), password)
      const ops = await opsExchange(id.token)
      setOpsToken(ops.token)
      onLogin({ subject: id.identity.id, role: ops.platform_roles[0] ?? 'platform_ops' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ops-login-wrap">
      <form className="ops-login" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="brand" style={{ marginBottom: 8 }}>
          <span className="brand-mark ops">OPS</span>
          <strong>Platform Ops</strong>
        </div>
        <p className="muted">{t('opsLoginNote')}</p>
        <label className="field">
          <span className="field-label">{t('fieldLoginName')}</span>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">{t('fieldPassword')}</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="banner banner-err">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || !login.trim() || !password}>
          {busy ? t('loggingIn') : t('login')}
        </button>
        <p className="muted">{t('opsSeedNote')}</p>
      </form>
    </div>
  )
}

const NAV_ITEMS: { page: OpsPage; labelKey: MsgKey; descKey: MsgKey }[] = [
  { page: 'tenants', labelKey: 'opsNavTenants', descKey: 'opsNavTenantsDesc' },
  { page: 'plugins', labelKey: 'opsNavPlugins', descKey: 'opsNavPluginsDesc' },
  { page: 'support', labelKey: 'opsNavSupport', descKey: 'opsNavSupportDesc' },
  { page: 'usage', labelKey: 'opsNavUsage', descKey: 'opsNavUsageDesc' },
  { page: 'audit', labelKey: 'opsNavAudit', descKey: 'opsNavAuditDesc' },
]

function OpsShell({ user, onLogout }: { user: { subject: string; role: string }; onLogout: () => void }) {
  const { t } = useLang()
  const [page, setPage] = useState<OpsPage>('tenants')
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark ops">OPS</span>
          <div>
            <strong>Platform Ops</strong>
            <div className="brand-sub">{t('opsBrandSub')}</div>
          </div>
        </div>
        <nav className="nav-groups">
          <div className="nav-group">
            <div className="nav-group-label">{t('opsNavGroup')}</div>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.page}
                className={`nav-item ${page === item.page ? 'active' : ''}`}
                onClick={() => setPage(item.page)}
                title={t(item.descKey)}
              >
                <span>{t(item.labelKey)}</span>
                <em>{t(item.descKey)}</em>
              </button>
            ))}
            <button className="nav-item" disabled>
              <span>{t('opsNavPlans')}</span>
              <em>{t('opsNavPlansDesc')}</em>
            </button>
          </div>
        </nav>
        <div className="sidebar-foot">platform-backend（Go）<br />{t('opsSidebarFoot')}</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <h1>{t(PAGE_TITLES[page])}</h1>
            <p className="topbar-sub">{t(PAGE_SUBTITLES[page])}</p>
          </div>
          <div className="topbar-right">
            <LanguageSelect compact />
            <span className="health-pill">
              <span className="health-dot up" />
              {user.subject} · {user.role}
            </span>
            <button className="btn btn-ghost" onClick={onLogout}>{t('logout')}</button>
          </div>
        </header>
        <main className="content">
          {page === 'tenants' && <TenantsPage />}
          {page === 'plugins' && <PluginsPage isAdmin={user.role === 'platform_admin'} />}
          {page === 'support' && <SupportPage />}
          {page === 'usage' && <UsagePage isFinance={user.role === 'platform_admin' || user.role === 'platform_finance'} />}
          {page === 'audit' && <AuditPage />}
        </main>
      </div>
    </div>
  )
}

// ---- 租户管理（F0）----

function TenantsPage() {
  const { t, lang } = useLang()
  const [view, setView] = useState<'list' | 'detail'>('list')
  const [tenants, setTenants] = useState<OpsTenant[] | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<OpsTenant | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [createName, setCreateName] = useState('')
  const [createOwner, setCreateOwner] = useState('frank')
  const [createPlan, setCreatePlan] = useState('plan-free')
  const [createMsg, setCreateMsg] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const query = async () => {
    setBusy(true)
    setError(null)
    try {
      const list = await opsListTenants({ q: q || undefined, status: status || undefined })
      setTenants(list.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void query()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDetail = async (id: string) => {
    setDetailError(null)
    try {
      setDetail(await opsGetTenant(id))
      setView('detail')
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    }
  }

  const changeStatus = async (id: string, to: string) => {
    setDetailError(null)
    try {
      setDetail(await opsChangeTenantStatus(id, to))
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    }
  }

  const create = async () => {
    setCreateMsg(null)
    setError(null)
    try {
      const created = await opsCreateTenant({ name: createName.trim(), owner_actor: createOwner.trim(), plan_id: createPlan })
      setCreateMsg(t('tenantCreatedMsg', { name: created.name, id: created.id, status: created.status }))
      setCreateName('')
      setShowCreate(false)
      await query()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (view === 'detail' && detail) {
    return (
      <div className="page">
        <div className="card">
          <div className="card-body">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => setView('list')}>
                <span className="btn-icon-text"><IconChevronLeft size={13} /> {t('btnBackToList')}</span>
              </button>
              <span className={`badge badge-${STATUS_TONES[detail.status] ?? 'neutral'}`}>{detail.status}</span>
            </div>
            {detailError && <div className="banner banner-err">{detailError}</div>}
            <div className="result-col">
              <div className="result-row"><span className="result-label">{t('tenant')}</span><span className="result-value"><strong>{detail.name}</strong> <code className="mono">{detail.id}</code></span></div>
              <div className="result-row"><span className="result-label">{t('labelPlanOwner')}</span><span className="result-value">{detail.plan_id || '—'} / {detail.owner_actor}</span></div>
              <div className="result-row"><span className="result-label">{t('labelMemberCount')}</span><span className="result-value">{detail.member_count}</span></div>
              <div className="result-row"><span className="result-label">{t('labelCreatedUpdated')}</span><span className="result-value muted">{new Date(detail.created_at).toLocaleString(langTag(lang), { hour12: false })} · {new Date(detail.updated_at).toLocaleString(langTag(lang), { hour12: false })}</span></div>
            </div>
            <div className="row gap wrap">
              {(NEXT_ACTIONS[detail.status] ?? []).map((a) => (
                <button
                  key={a.to}
                  className={`btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : ''}`}
                  onClick={() => void changeStatus(detail.id, a.to)}
                >
                  {t(a.labelKey)}
                </button>
              ))}
              {(NEXT_ACTIONS[detail.status] ?? []).length === 0 && <span className="muted">{t('terminalStateHint')}</span>}
            </div>
            <MembersPanel tenantId={detail.id} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {error && <div className="banner banner-err">{error}</div>}
      <div className="card">
        <div className="card-body">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{t('tenantDirTitle')}</strong>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <span className="btn-icon-text"><IconPlus size={13} /> {t('btnNewTenant')}</span>
            </button>
          </div>
          <div className="row gap wrap">
            <input className="input" style={{ width: 180 }} placeholder={t('fieldTenantName')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('optAllStatus')}</option>
              <option value="provisioning">provisioning</option>
              <option value="active">active</option>
              <option value="suspended">suspended</option>
              <option value="closing">closing</option>
              <option value="closed">closed</option>
            </select>
            <button className="btn" disabled={busy} onClick={() => void query()}>{busy ? t('querying') : t('query')}</button>
          </div>
          {createMsg && <p className="muted">{createMsg}</p>}
          {tenants && tenants.length > 0 && (
            <table className="table">
              <thead><tr><th>{t('tenant')}</th><th>{t('status')}</th><th>{t('thPlan')}</th><th>Owner</th><th>{t('labelMemberCount')}</th><th>{t('thCreatedAt')}</th><th></th></tr></thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td><strong>{tenant.name}</strong> <code className="mono">{tenant.id}</code></td>
                    <td><span className={`badge badge-${STATUS_TONES[tenant.status] ?? 'neutral'}`}>{tenant.status}</span></td>
                    <td>{tenant.plan_id || '—'}</td>
                    <td>{tenant.owner_actor}</td>
                    <td>{tenant.member_count}</td>
                    <td className="muted">{new Date(tenant.created_at).toLocaleString(langTag(lang), { hour12: false })}</td>
                    <td><button className="btn btn-xs" onClick={() => void openDetail(tenant.id)}>{t('detail')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tenants && tenants.length === 0 && <p className="muted">{t('noMatchingTenants')}</p>}
        </div>
      </div>

      {showCreate && (
        <Modal title={t('createTenantTitle')} onClose={() => setShowCreate(false)}>
          <div className="col gap">
            <label className="field"><span className="field-label">{t('fieldTenantName')}</span>
              <input className="input" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="acme" /></label>
            <label className="field"><span className="field-label">{t('fieldOwnerActor')}</span>
              <input className="input" value={createOwner} onChange={(e) => setCreateOwner(e.target.value)} placeholder="frank" /></label>
            <label className="field"><span className="field-label">{t('fieldPlan')}</span>
              <select className="input select" value={createPlan} onChange={(e) => setCreatePlan(e.target.value)}>
                <option value="plan-free">plan-free</option>
                <option value="plan-pro">plan-pro</option>
              </select></label>
            <button
              className="btn btn-primary"
              disabled={busy || !createName.trim() || !createOwner.trim()}
              onClick={() => void create()}
            >
              {t('btnCreateTenant')}
            </button>
            <p className="muted">{t('createTenantNote')}</p>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MembersPanel({ tenantId }: { tenantId: string }) {
  const { t, lang } = useLang()
  const [members, setMembers] = useState<{ items: { actor_id: string; role: string; status: string; joined_at: string }[] } | null>(null)
  useEffect(() => {
    void opsListMembers(tenantId).then(setMembers).catch(() => setMembers({ items: [] }))
  }, [tenantId])
  if (!members) return <p className="muted">{t('membersLoading')}</p>
  if (members.items.length === 0) return <p className="muted">{t('tenantNoMembers')}</p>
  return (
    <table className="table">
      <thead><tr><th>{t('thMemberActor')}</th><th>{t('thTenantRole')}</th><th>{t('status')}</th><th>{t('thJoinedAt')}</th></tr></thead>
      <tbody>
        {members.items.map((m) => (
          <tr key={m.actor_id}>
            <td><code className="mono">{m.actor_id}</code></td>
            <td>{m.role}</td>
            <td>{m.status}</td>
            <td className="muted">{new Date(m.joined_at).toLocaleString(langTag(lang), { hour12: false })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---- 用量与费用（F2 #22/#23）----

function UsagePage({ isFinance }: { isFinance: boolean }) {
  const { t } = useLang()
  const [rows, setRows] = useState<UsageRow[] | null>(null)
  const [asOf, setAsOf] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const query = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await opsUsageOverview()
      setRows(res.rows)
      setAsOf(res.as_of)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void query()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportUsage = async (tenantId: string) => {
    setExportMsg(null)
    try {
      const job = await opsCreateUsageExport(tenantId)
      const csv = await opsDownloadUsageExport(job.operation_id)
      // 触发浏览器下载（下载已重新鉴权，PAAS-20）
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${job.operation_id}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setExportMsg(t('exportDoneMsg', { id: job.operation_id, rows: job.rows }))
    } catch (e) {
      setExportMsg(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="page">
      {error && <div className="banner banner-err">{error}</div>}
      <div className="card">
        <div className="card-body">
          <div className="row gap">
            <button className="btn btn-primary" disabled={busy} onClick={() => void query()}>{busy ? t('querying') : t('refresh')}</button>
            <span className="muted">{asOf ? `as_of ${asOf}` : ''} · {t('usageDisclaimer')}</span>
          </div>
          {rows && rows.length > 0 && (
            <table className="table">
              <thead><tr><th>{t('tenant')}</th><th>{t('thMetricsCols')}</th><th>{t('thCostEstimate')}</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tenant_id}>
                    <td><strong>{r.tenant_name}</strong> <code className="mono">{r.tenant_id}</code><br />
                      <span className={`badge badge-${STATUS_TONES[r.status] ?? 'neutral'}`}>{r.status}</span></td>
                    <td>
                      {r.metrics.length === 0
                        ? <span className="muted">{t('noMetering')}</span>
                        : r.metrics.map((m) => (
                          <div key={m.metric} className="muted">
                            {m.metric}: {m.total} {m.unit}
                            {m.by_quality.unknown ? ` · ${t('unknownPending', { count: m.by_quality.unknown })}` : ''}
                          </div>
                        ))}
                    </td>
                    <td>
                      {r.metrics.length === 0 ? '—' : (
                        <><strong>{r.estimated_cost.toFixed(2)}</strong> {r.currency} <span className="badge badge-warn">estimated</span></>
                      )}
                    </td>
                    <td>{isFinance && <button className="btn btn-xs" onClick={() => void exportUsage(r.tenant_id)}>{t('btnExportCsv')}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows && rows.length === 0 && <p className="muted">{t('noTenantsYet')}</p>}
          {exportMsg && <p className="muted">{exportMsg}</p>}
        </div>
      </div>
    </div>
  )
}

// ---- 安全审计（F2 #24）----

function AuditPage() {
  const { t, lang } = useLang()
  const [items, setItems] = useState<AuditEntryView[] | null>(null)
  const [total, setTotal] = useState(0)
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const query = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await opsSearchAudit({ actor: actor || undefined, action: action || undefined })
      setItems(res.items)
      setTotal(res.total_matched)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void query()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      {error && <div className="banner banner-err">{error}</div>}
      <div className="card">
        <div className="card-body">
          <div className="row gap wrap">
            <input className="input" style={{ width: 160 }} placeholder={t('phActor')} value={actor} onChange={(e) => setActor(e.target.value)} />
            <input className="input" style={{ width: 180 }} placeholder={t('phActionPrefix')} value={action} onChange={(e) => setAction(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} onClick={() => void query()}>{busy ? t('querying') : t('query')}</button>
          </div>
          {items && items.length > 0 && (
            <table className="table">
              <thead><tr><th>{t('time')}</th><th>{t('thActor')}</th><th>{t('thAction')}</th><th>{t('thTarget')}</th><th>{t('thReason')}</th></tr></thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td className="muted">{new Date(e.at).toLocaleString(langTag(lang), { hour12: false })}</td>
                    <td><code className="mono">{e.actor}</code></td>
                    <td>{e.action}</td>
                    <td><code className="mono">{e.target}</code></td>
                    <td className="muted">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {items && items.length === 0 && <p className="muted">{t('noMatchingAudit')}</p>}
          {total > 0 && <p className="muted">{t('auditMatched', { count: total })}</p>}
        </div>
      </div>
    </div>
  )
}
