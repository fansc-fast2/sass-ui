// 平台运营面（/ops，PaaS 改造方案 §8 D2 双 shell）：平台身份登录后进入，
// 与租户业务面物理隔离——平台凭据无租户上下文，无法访问任何业务数据。
// P0 范围：登录、租户列表/检索、租户详情与生命周期、成员只读。

import { useEffect, useState } from 'react'
import {
  getOpsToken, identityLogin, opsChangeTenantStatus, opsCreateTenant, opsExchange, opsGetTenant, opsListMembers,
  opsListTenants, opsMe, setOpsToken,
} from './opsClient'
import type { OpsTenant } from './opsClient'

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  active: 'ok',
  provisioning: 'warn',
  suspended: 'err',
  closing: 'warn',
  closed: 'neutral',
}

const NEXT_ACTIONS: Record<string, { to: string; label: string }[]> = {
  provisioning: [{ to: 'active', label: '审核通过并激活' }],
  active: [
    { to: 'suspended', label: '冻结' },
    { to: 'closing', label: '进入注销流程' },
  ],
  suspended: [
    { to: 'active', label: '恢复' },
    { to: 'closing', label: '进入注销流程' },
  ],
  closing: [{ to: 'closed', label: '完成注销' }],
  closed: [],
}

export default function OpsApp() {
  const [user, setUser] = useState<{ subject: string; role: string } | null>(null)
  const [booted, setBooted] = useState(false)

  // 已有会话则恢复（ops 会话随标签页 sessionStorage 存活）
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

  if (!booted) return <div className="ops-boot">检测会话中…</div>
  if (!user) return <OpsLogin onLogin={setUser} />
  return <OpsShell user={user} onLogout={() => { setOpsToken(null); setUser(null) }} />
}

// 登录两步：Identity 登录（dev 适配器）→ 交换 Ops 会话（需平台角色授权）
function OpsLogin({ onLogin }: { onLogin: (u: { subject: string; role: string }) => void }) {
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
      <form
        className="ops-login"
        onSubmit={(e) => { e.preventDefault(); void submit() }}
      >
        <div className="brand" style={{ marginBottom: 8 }}>
          <span className="brand-mark ops">OPS</span>
          <strong>Platform Ops</strong>
        </div>
        <p className="muted">平台运营入口（platform_admin / ops / finance / support）。平台账号无租户业务数据权限。</p>
        <label className="field">
          <span className="field-label">登录名</span>
          <input className="input" value={login} onChange={(e) => setLogin(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">密码</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="banner banner-err">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || !login.trim() || !password}>
          {busy ? '登录中…' : '登录'}
        </button>
        <p className="muted">开发种子账号：ops-admin / ops-admin123（生产接入 M0 Q06 身份服务后替换）</p>
      </form>
    </div>
  )
}

function OpsShell({ user, onLogout }: { user: { subject: string; role: string }; onLogout: () => void }) {
  const [page, setPage] = useState<'tenants' | 'detail'>('tenants')
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
      setPage('detail')
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
      const t = await opsCreateTenant({ name: createName.trim(), owner_actor: createOwner.trim(), plan_id: createPlan })
      setCreateMsg(`已创建 ${t.name}（${t.id}，${t.status}）`)
      setCreateName('')
      await query()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark ops">OPS</span>
          <div>
            <strong>Platform Ops</strong>
            <div className="brand-sub">平台运营（独立于租户业务面）</div>
          </div>
        </div>
        <nav className="nav-groups">
          <div className="nav-group">
            <div className="nav-group-label">平台管理</div>
            <button className={`nav-item ${page !== 'detail' ? 'active' : ''}`} onClick={() => setPage('tenants')}>
              <span>租户管理</span>
              <em>租户列表 · 生命周期</em>
            </button>
            <button className="nav-item" disabled>
              <span>套餐与权益</span>
              <em>P1 计划中</em>
            </button>
            <button className="nav-item" disabled>
              <span>用量与费用</span>
              <em>P2 计划中</em>
            </button>
            <button className="nav-item" disabled>
              <span>安全审计</span>
              <em>P2 计划中</em>
            </button>
          </div>
        </nav>
        <div className="sidebar-foot">platform-backend（Go）<br />/ops/v1 · 平台域（ADR-17）</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div>
            <h1>{page === 'tenants' ? '租户管理' : '租户详情'}</h1>
            <p className="topbar-sub">平台管理功能不隶属任何租户；支持访问需短期授权与审计（P1）</p>
          </div>
          <div className="topbar-right">
            <span className="health-pill">
              <span className="health-dot up" />
              {user.subject} · {user.role}
            </span>
            <button className="btn btn-ghost" onClick={onLogout}>退出</button>
          </div>
        </header>
        <main className="content">
          {error && <div className="banner banner-err">{error}</div>}
          {page === 'tenants' && (
            <div className="page">
              <div className="card">
                <div className="card-body">
                  <div className="row gap wrap">
                    <input className="input" style={{ width: 180 }} placeholder="租户名称" value={q} onChange={(e) => setQ(e.target.value)} />
                    <select className="input select" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value)}>
                      <option value="">（全部状态）</option>
                      <option value="provisioning">provisioning</option>
                      <option value="active">active</option>
                      <option value="suspended">suspended</option>
                      <option value="closing">closing</option>
                      <option value="closed">closed</option>
                    </select>
                    <button className="btn btn-primary" disabled={busy} onClick={() => void query()}>{busy ? '查询中…' : '查询'}</button>
                  </div>
                  {tenants && tenants.length > 0 && (
                    <table className="table">
                      <thead><tr><th>租户</th><th>状态</th><th>套餐</th><th>Owner</th><th>成员数</th><th>创建时间</th><th></th></tr></thead>
                      <tbody>
                        {tenants.map((t) => (
                          <tr key={t.id}>
                            <td><strong>{t.name}</strong> <code className="mono">{t.id}</code></td>
                            <td><span className={`badge badge-${STATUS_TONES[t.status] ?? 'neutral'}`}>{t.status}</span></td>
                            <td>{t.plan_id || '—'}</td>
                            <td>{t.owner_actor}</td>
                            <td>{t.member_count}</td>
                            <td className="muted">{new Date(t.created_at).toLocaleString('zh-CN', { hour12: false })}</td>
                            <td><button className="btn btn-xs" onClick={() => void openDetail(t.id)}>详情</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {tenants && tenants.length === 0 && <p className="muted">没有匹配的租户</p>}
                </div>
              </div>
              <div className="card">
                <div className="card-body">
                  <strong>新增租户</strong>
                  <div className="row gap wrap">
                    <input className="input" style={{ width: 180 }} placeholder="租户名称" value={createName} onChange={(e) => setCreateName(e.target.value)} />
                    <input className="input" style={{ width: 140 }} placeholder="owner actor" value={createOwner} onChange={(e) => setCreateOwner(e.target.value)} />
                    <select className="input select" style={{ width: 140 }} value={createPlan} onChange={(e) => setCreatePlan(e.target.value)}>
                      <option value="plan-free">plan-free</option>
                      <option value="plan-pro">plan-pro</option>
                    </select>
                    <button className="btn btn-primary" disabled={busy || !createName.trim() || !createOwner.trim()} onClick={() => void create()}>创建（provisioning）</button>
                  </div>
                  {createMsg && <p className="muted">{createMsg}</p>}
                </div>
              </div>
            </div>
          )}
          {page === 'detail' && (
            <div className="page">
              <div className="card">
                <div className="card-body">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <button className="btn btn-ghost" onClick={() => setPage('tenants')}>← 返回列表</button>
                    <span className={`badge badge-${STATUS_TONES[detail?.status ?? ''] ?? 'neutral'}`}>{detail?.status ?? '—'}</span>
                  </div>
                  {detailError && <div className="banner banner-err">{detailError}</div>}
                  {detail && (
                    <>
                      <div className="result-col">
                        <div className="result-row"><span className="result-label">租户</span><span className="result-value"><strong>{detail.name}</strong> <code className="mono">{detail.id}</code></span></div>
                        <div className="result-row"><span className="result-label">套餐 / Owner</span><span className="result-value">{detail.plan_id || '—'} / {detail.owner_actor}</span></div>
                        <div className="result-row"><span className="result-label">成员数</span><span className="result-value">{detail.member_count}</span></div>
                        <div className="result-row"><span className="result-label">创建 / 更新</span><span className="result-value muted">{new Date(detail.created_at).toLocaleString('zh-CN', { hour12: false })} · {new Date(detail.updated_at).toLocaleString('zh-CN', { hour12: false })}</span></div>
                      </div>
                      <div className="row gap wrap">
                        {(NEXT_ACTIONS[detail.status] ?? []).map((a) => (
                          <button
                            key={a.to}
                            className={`btn ${a.to === 'active' ? 'btn-primary' : a.to === 'closing' || a.to === 'suspended' ? 'btn-danger' : ''}`}
                            onClick={() => void changeStatus(detail.id, a.to)}
                          >
                            {a.label}
                          </button>
                        ))}
                        {NEXT_ACTIONS[detail.status]?.length === 0 && <span className="muted">已终态（closed），不可再变更</span>}
                      </div>
                      <MembersPanel tenantId={detail.id} />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function MembersPanel({ tenantId }: { tenantId: string }) {
  const [members, setMembers] = useState<{ items: { actor_id: string; role: string; status: string; joined_at: string }[] } | null>(null)
  useEffect(() => {
    void opsListMembers(tenantId).then(setMembers).catch(() => setMembers({ items: [] }))
  }, [tenantId])
  if (!members) return <p className="muted">成员加载中…</p>
  if (members.items.length === 0) return <p className="muted">该租户暂无成员</p>
  return (
    <table className="table">
      <thead><tr><th>成员（actor）</th><th>租户内角色</th><th>状态</th><th>加入时间</th></tr></thead>
      <tbody>
        {members.items.map((m) => (
          <tr key={m.actor_id}>
            <td><code className="mono">{m.actor_id}</code></td>
            <td>{m.role}</td>
            <td>{m.status}</td>
            <td className="muted">{new Date(m.joined_at).toLocaleString('zh-CN', { hour12: false })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
