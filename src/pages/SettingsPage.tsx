// 设置（/settings，底部导航）：身份会话、权威成员关系、成员管理（tenant_admin）、
// 用量与配额、支持授权、接口一览。租户目录/成员治理的权威在平台控制面（ADR-17）。

import { useEffect, useState } from 'react'
import {
  listTenantMembers, createTenantInvitation, updateTenantMember,
  getTenantSettings, updateTenantSettings,
  getTenantUsage,
  listTenantSupportGrants, decideSupportGrant,
} from '../api/api'
import type { TenantMember, TenantUsageBucket, TenantSupportGrant } from '../api/types'
import { Badge, Button, Card, Field, MonoText, Select, TextInput } from '../components/ui'
import { Modal } from '../components/Modal'
import { LoginFlow } from '../components/LoginFlow'
import { PERM_LABELS, ROLE_LABELS } from '../session/permissions'
import { useSession } from '../session/SessionContext'

const ROLE_OPTIONS = ['viewer', 'analyst', 'knowledge_reviewer', 'publisher', 'tenant_admin'] as const

const ROUTES: { method: string; path: string; perm: string }[] = [
  { method: 'GET', path: '/v1/connections/{id}/capabilities', perm: 'connection.read' },
  { method: 'POST', path: '/v1/sync-jobs', perm: 'knowledge.sync' },
  { method: 'POST', path: '/v1/audit-jobs', perm: 'seo.audit' },
  { method: 'GET', path: '/v1/products/{id}/knowledge', perm: 'knowledge.read' },
  { method: 'GET', path: '/v1/issues', perm: 'knowledge.read' },
  { method: 'POST', path: '/v1/issues/{id}/dismiss', perm: 'knowledge.verify' },
  { method: 'POST', path: '/v1/facts/{id}/verify', perm: 'knowledge.verify' },
  { method: 'POST', path: '/v1/change-sets', perm: 'change.propose' },
  { method: 'GET', path: '/v1/change-sets', perm: 'change.read' },
  { method: 'GET', path: '/v1/change-sets/{id}', perm: 'change.read' },
  { method: 'POST', path: '/v1/change-sets/{id}/authorize', perm: 'change.authorize' },
  { method: 'POST', path: '/v1/change-sets/{id}/revoke', perm: 'change.authorize' },
  { method: 'POST', path: '/v1/change-sets/{id}/execute', perm: 'change.execute' },
  { method: 'GET', path: '/v1/executions/{id}', perm: 'job.read' },
  { method: 'POST', path: '/v1/executions/{id}/restore-proposals', perm: 'change.restore' },
  { method: 'GET', path: '/v1/jobs/{id}', perm: 'job.read' },
  { method: 'POST', path: '/v1/jobs/{id}/cancel', perm: 'job.cancel' },
  { method: 'GET', path: '/v1/me/capabilities', perm: 'self.read' },
  { method: 'GET', path: '/v1/overview', perm: 'workspace.read' },
  { method: 'GET', path: '/v1/action-items', perm: 'workspace.read' },
  { method: 'GET', path: '/v1/products', perm: 'knowledge.read' },
  { method: 'GET', path: '/v1/products/{id}', perm: 'knowledge.read' },
  { method: 'GET', path: '/v1/sites', perm: 'connection.read' },
  { method: 'GET', path: '/v1/sites/{id}', perm: 'connection.read' },
  { method: 'GET', path: '/v1/evidence', perm: 'knowledge.read' },
  { method: 'GET', path: '/v1/evidence/{id}', perm: 'knowledge.read' },
  { method: 'GET', path: '/v1/issues/{id}', perm: 'knowledge.read' },
  { method: 'GET', path: '/v1/jobs', perm: 'job.read' },
  { method: 'GET', path: '/v1/notifications', perm: 'notification.read' },
  { method: 'POST', path: '/v1/notifications/{id}/read', perm: 'notification.read' },
  { method: 'GET', path: '/v1/activity-events', perm: 'activity.read' },
]

export function SettingsPage() {
  const { hasScope, active, identityUser, logout } = useSession()
  const isAdmin = active?.role === 'tenant_admin'

  return (
    <div className="page">
      <Card title="身份会话" subtitle="IdentityContext 与 TenantContext 分离；会话凭据只存本标签页 sessionStorage">
        {identityUser ? (
          <div className="result-col">
            <div className="result-row"><span className="result-label">身份</span><span className="result-value"><strong>{identityUser.display_name}</strong>（{identityUser.login}）</span></div>
            <div className="result-row"><span className="result-label">当前租户</span><span className="result-value">{active ? <><strong>{active.tenantName}</strong> · {active.role}</> : '未选择'}</span></div>
            <div className="result-row"><span className="result-label">退出登录</span><span className="result-value"><button className="btn btn-xs" onClick={logout}>清除本页会话</button></span></div>
          </div>
        ) : (
          <LoginFlow />
        )}
      </Card>

      <TenantInfoCard isAdmin={isAdmin} tenantId={active?.tenantId ?? ''} />
      <MemberManagementCard isAdmin={isAdmin} tenantId={active?.tenantId ?? ''} />
      <UsageCard tenantId={active?.tenantId ?? ''} />
      <SupportGrantsCard isAdmin={isAdmin} tenantId={active?.tenantId ?? ''} />

      <Card title="接口一览" subtitle="后端 devkit v1.8 的 31 个 /v1 操作；✓ = 当前角色具备所需权限">
        <table className="table">
          <thead><tr><th>方法</th><th>路径</th><th>所需权限</th><th>当前角色</th></tr></thead>
          <tbody>
            {ROUTES.map((r) => (
              <tr key={`${r.method} ${r.path}`}>
                <td><Badge tone={r.method === 'GET' ? 'neutral' : 'info'}>{r.method}</Badge></td>
                <td><MonoText>{r.path}</MonoText></td>
                <td>{r.perm}{PERM_LABELS[r.perm] ? ` · ${PERM_LABELS[r.perm]}` : ''}</td>
                <td>{hasScope(r.perm) ? <Badge tone="ok">✓</Badge> : <Badge tone="warn">✗</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ---- 租户信息（v0.2 §9 #15/16：非安全元数据，乐观并发）----

function TenantInfoCard({ isAdmin, tenantId }: { isAdmin: boolean; tenantId: string }) {
  const [name, setName] = useState('')
  const [rowVersion, setRowVersion] = useState(0)
  const [status, setStatus] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    void getTenantSettings().then((res) => {
      setName(res.data.name)
      setRowVersion(res.data.row_version)
      setStatus(res.data.status)
    }).catch(() => setError('无法加载租户信息'))
  }, [tenantId])

  const save = async () => {
    setError(null); setMsg(null)
    try {
      const res = await updateTenantSettings({ name: name.trim(), expected_row_version: rowVersion })
      setName(res.data.name)
      setRowVersion(res.data.row_version)
      setMsg('已保存')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  if (!tenantId) return null
  return (
    <Card title="租户信息" subtitle={isAdmin ? '重命名（乐观并发：与服务端版本一致才生效）' : '只有 tenant_admin 可以修改'}>
      {error && <div className="banner banner-err">{error}</div>}
      <div className="row gap wrap">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} />
        <Badge tone={status === 'active' ? 'ok' : 'warn'}>{status || '—'}</Badge>
        <Button variant="primary" disabled={!isAdmin || !name.trim()} onClick={() => void save()}>保存</Button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </Card>
  )
}

// ---- 成员管理 ----

function MemberManagementCard({ isAdmin, tenantId }: { isAdmin: boolean; tenantId: string }) {
  const { memberships, selectTenant } = useSession()
  const [members, setMembers] = useState<TenantMember[]>([])
  const [invitee, setInvitee] = useState('')
  const [role, setRole] = useState('viewer')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInvite, setShowInvite] = useState(false)

  const load = async () => {
    if (!tenantId) return
    try {
      const res = await listTenantMembers()
      setMembers(res.data.items)
    } catch { /* 忽略 */ }
  }

  useEffect(() => { void load() /* eslint-disable-line */ }, [tenantId])

  const invite = async () => {
    setError(null); setMsg(null)
    try {
      const res = await createTenantInvitation({ invitee_login: invitee.trim(), role })
      setInviteToken(res.data.token)
      setMsg(`邀请已创建（${res.data.id}），明文令牌只显示一次`)
      setInvitee('')
      setShowInvite(false)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const changeRole = async (membershipId: string, newRole: string) => {
    setError(null)
    try { await updateTenantMember(membershipId, { role: newRole }); await load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const disableMember = async (membershipId: string) => {
    setError(null)
    try { await updateTenantMember(membershipId, { status: 'disabled' }); await load() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <Card title="成员管理" subtitle={isAdmin ? '邀请、改角色、停用成员（tenant_admin）' : '只有 tenant_admin 可以管理成员'}>
      {error && <div className="banner banner-err">{error}</div>}
      {members.length > 0 && (
        <table className="table">
          <thead><tr><th>成员</th><th>角色</th><th>状态</th>{isAdmin && <th>操作</th>}</tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membership_id} className={m.status === 'active' ? '' : 'row-dimmed'}>
                <td><MonoText>{m.subject_id}</MonoText></td>
                <td>
                  {isAdmin
                    ? <Select value={m.role} onChange={(e) => void changeRole(m.membership_id, e.target.value)} style={{ width: 160 }}>
                        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}</option>)}
                      </Select>
                    : ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}
                </td>
                <td><Badge tone={m.status === 'active' ? 'ok' : 'warn'}>{m.status}</Badge></td>
                {isAdmin && <td><Button className="btn-xs" variant="ghost" onClick={() => void disableMember(m.membership_id)}>停用</Button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isAdmin && (
        <div className="row gap wrap">
          <Button variant="primary" onClick={() => setShowInvite(true)}>＋ 邀请成员</Button>
        </div>
      )}
      {showInvite && isAdmin && (
        <Modal title="邀请成员" onClose={() => setShowInvite(false)}>
          <div className="col gap">
            <Field label="受邀身份登录名">
              <TextInput value={invitee} onChange={(e) => setInvitee(e.target.value)} placeholder="olivia" />
            </Field>
            <Field label="租户内角色">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}</option>)}
              </Select>
            </Field>
            <Button variant="primary" disabled={!invitee.trim()} onClick={() => void invite()}>创建邀请</Button>
            <p className="muted">邀请创建后生成一次性明文令牌（只显示一次），受邀人在"我的邀请"中凭令牌接受。</p>
          </div>
        </Modal>
      )}
      {inviteToken && (
        <div className="banner banner-warn">
          <strong>邀请令牌（只显示一次）：</strong>
          <code className="mono" style={{ wordBreak: 'break-all' }}>{inviteToken}</code>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
      {!isAdmin && memberships.length > 1 && (
        <div className="row gap wrap">
          <span className="muted">切换租户：</span>
          {memberships.filter((m) => m.tenant_id !== tenantId).map((m) => (
            <Button key={m.membership_id} className="btn-xs" onClick={() => void selectTenant(m.membership_id)}>
              {m.tenant_name}
            </Button>
          ))}
        </div>
      )}
    </Card>
  )
}

// ---- 用量与配额 ----

function UsageCard({ tenantId }: { tenantId: string }) {
  const [buckets, setBuckets] = useState<TenantUsageBucket[]>([])
  const [asOf, setAsOf] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    void getTenantUsage().then((res) => {
      setBuckets(res.data.buckets)
      setAsOf(res.data.as_of)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [tenantId])

  return (
    <Card title="用量与配额" subtitle="GET /v1/tenant/usage · 空列表 = 尚未接入计量（不显示 0）">
      {!loaded ? (
        <p className="muted">加载中…</p>
      ) : buckets.length === 0 ? (
        <p className="muted">该租户尚未接入计量——配额桶配置后此处展示用量与余量。</p>
      ) : (
        <>
          <table className="table">
            <thead><tr><th>计费项</th><th>范围</th><th>账期</th><th>已用</th><th>预占</th><th>上限</th></tr></thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={i}>
                  <td>{b.metric}</td>
                  <td className="muted">{b.scope_type}</td>
                  <td>{b.period}</td>
                  <td><Badge tone={b.used + b.reserved >= b.limit ? 'err' : 'neutral'}>{b.used}</Badge></td>
                  <td>{b.reserved}</td>
                  <td>{b.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">as_of {asOf}</p>
        </>
      )}
    </Card>
  )
}

// ---- 支持授权 ----

function SupportGrantsCard({ isAdmin, tenantId }: { isAdmin: boolean; tenantId: string }) {
  const { identityUser } = useSession()
  const [grants, setGrants] = useState<TenantSupportGrant[]>([])
  const [loaded, setLoaded] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    if (!tenantId) return
    try {
      const res = await listTenantSupportGrants()
      setGrants(res.data.items)
      setLoaded(true)
    } catch { /* 忽略 */ }
  }

  useEffect(() => { void load() /* eslint-disable-line */ }, [tenantId])

  const decide = async (id: string, approve: boolean) => {
    setMsg(null)
    try {
      await decideSupportGrant(id, approve)
      setMsg(approve ? '已批准支持访问' : '已拒绝支持访问')
      await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <Card title="支持授权" subtitle="平台人员发起的受控支持访问；tenant_admin 审批，默认只读、15 分钟有效。申请人≠批准人。">
      {!loaded ? <p className="muted">加载中…</p>
      : grants.length === 0 ? <p className="muted">没有支持授权记录</p>
      : (
        <table className="table">
          <thead><tr><th>发起人</th><th>用途</th><th>工单</th><th>状态</th><th>会话到期</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id}>
                <td><MonoText>{g.requested_by}</MonoText></td>
                <td>{g.purpose}</td>
                <td className="muted">{g.ticket || '—'}</td>
                <td><Badge tone={g.status === 'active' ? 'ok' : g.status === 'requested' ? 'warn' : g.status === 'approved' ? 'info' : 'neutral'}>{g.status}</Badge></td>
                <td className="muted">{g.session_expires_at ? new Date(g.session_expires_at as string).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}</td>
                {isAdmin && (
                  <td>
                    {g.status === 'requested' && g.can_decide && (
                      <div className="row gap">
                        <Button className="btn-xs" variant="primary" onClick={() => void decide(g.id, true)}>批准</Button>
                        <Button className="btn-xs" variant="danger" onClick={() => void decide(g.id, false)}>拒绝</Button>
                      </div>
                    )}
                    {g.requested_by === identityUser?.id && g.status === 'requested' && (
                      <span className="muted">等待租户管理员审批（不能自批）</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {msg && <p className="muted">{msg}</p>}
    </Card>
  )
}
