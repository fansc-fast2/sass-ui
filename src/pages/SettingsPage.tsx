// 设置（/settings，底部导航）：身份会话、权威成员关系、成员管理（tenant_admin）、
// 用量与配额、支持授权、接口一览。租户目录/成员治理的权威在平台控制面（ADR-17）。
// 本页同时承载语言切换（中/英，即时生效，localStorage 记忆）。

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
import { LanguageSelect } from '../components/LanguageSelect'
import { IconCheck, IconPlus, IconX } from '../components/icons'
import { toast } from '../components/Toast'
import { useLang } from '../i18n'
import { permLabel, roleLabel } from '../session/permissions'
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
  const { t } = useLang()
  const { hasScope, active, identityUser, logout } = useSession()
  const isAdmin = active?.role === 'tenant_admin'

  return (
    <div className="page">
      <Card title={t('identityCardTitle')} subtitle={t('identityCardSub')}>
        {identityUser ? (
          <div className="result-col">
            <div className="result-row"><span className="result-label">{t('labelIdentity')}</span><span className="result-value"><strong>{identityUser.display_name}</strong>（{identityUser.login}）</span></div>
            <div className="result-row"><span className="result-label">{t('currentTenant')}</span><span className="result-value">{active ? <><strong>{active.tenantName}</strong> · {active.role}</> : t('notSelected')}</span></div>
            <div className="result-row"><span className="result-label">{t('labelLogout')}</span><span className="result-value"><button className="btn btn-xs" onClick={logout}>{t('btnClearSession')}</button></span></div>
          </div>
        ) : (
          <LoginFlow />
        )}
      </Card>

      <Card title={t('langCardTitle')} subtitle={t('langCardSub')}>
        <div className="row gap">
          <span className="muted">{t('langLabel')}</span>
          <LanguageSelect />
        </div>
      </Card>

      <TenantInfoCard isAdmin={isAdmin} tenantId={active?.tenantId ?? ''} />
      <MemberManagementCard isAdmin={isAdmin} tenantId={active?.tenantId ?? ''} />
      <UsageCard tenantId={active?.tenantId ?? ''} />
      <SupportGrantsCard isAdmin={isAdmin} tenantId={active?.tenantId ?? ''} />

      <Card title={t('routesCardTitle')} subtitle={t('routesCardSub')}>
        <table className="table">
          <thead><tr><th>{t('thMethod')}</th><th>{t('thPath')}</th><th>{t('thRequiredPerm')}</th><th>{t('thCurrentRole')}</th></tr></thead>
          <tbody>
            {ROUTES.map((r) => (
              <tr key={`${r.method} ${r.path}`}>
                <td><Badge tone={r.method === 'GET' ? 'neutral' : 'info'}>{r.method}</Badge></td>
                <td><MonoText>{r.path}</MonoText></td>
                <td>{r.perm}{permLabel(t, r.perm) ? ` · ${permLabel(t, r.perm)}` : ''}</td>
                <td>
                  {hasScope(r.perm)
                    ? <span className="status-badge status-ok shape-dot" title={t('permAllowedTitle')}><span className="status-shape" aria-hidden /><span className="status-icon" aria-hidden><IconCheck size={11} /></span>{t('permAllowed')}</span>
                    : <span className="status-badge status-warn shape-triangle" title={t('permHigherNeededTitle')}><span className="status-shape" aria-hidden /><span className="status-icon" aria-hidden><IconX size={11} /></span>{t('permHigherNeeded')}</span>}
                </td>
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
  const { t } = useLang()
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
    }).catch(() => setError(t('loadTenantInfoFailed')))
  }, [tenantId, t])

  const save = async () => {
    setError(null); setMsg(null)
    try {
      const res = await updateTenantSettings({ name: name.trim(), expected_row_version: rowVersion })
      setName(res.data.name)
      setRowVersion(res.data.row_version)
      setMsg(t('saved'))
      toast.ok(t('tenantSavedToast'))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  if (!tenantId) return null
  return (
    <Card title={t('tenantInfoTitle')} subtitle={isAdmin ? t('tenantInfoSubAdmin') : t('tenantInfoSubNonAdmin')}>
      {error && <div className="banner banner-err">{error}</div>}
      <div className="row gap wrap">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} style={{ width: 220 }} />
        <Badge tone={status === 'active' ? 'ok' : 'warn'}>{status || '—'}</Badge>
        <Button variant="primary" disabled={!isAdmin || !name.trim()} onClick={() => void save()}>{t('save')}</Button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </Card>
  )
}

// ---- 成员管理 ----

function MemberManagementCard({ isAdmin, tenantId }: { isAdmin: boolean; tenantId: string }) {
  const { t } = useLang()
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
      setMsg(t('inviteCreatedMsg', { id: res.data.id }))
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
    <Card title={t('membersCardTitle')} subtitle={isAdmin ? t('membersSubAdmin') : t('membersSubNonAdmin')}>
      {error && <div className="banner banner-err">{error}</div>}
      {members.length > 0 && (
        <table className="table">
          <thead><tr><th>{t('member')}</th><th>{t('role')}</th><th>{t('status')}</th>{isAdmin && <th>{t('actions')}</th>}</tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.membership_id} className={m.status === 'active' ? '' : 'row-dimmed'}>
                <td><MonoText>{m.subject_id}</MonoText></td>
                <td>
                  {isAdmin
                    ? <Select value={m.role} onChange={(e) => void changeRole(m.membership_id, e.target.value)} style={{ width: 160 }}>
                        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(t, r)}</option>)}
                      </Select>
                    : roleLabel(t, m.role)}
                </td>
                <td><Badge tone={m.status === 'active' ? 'ok' : 'warn'}>{m.status}</Badge></td>
                {isAdmin && <td><Button className="btn-xs" variant="ghost" onClick={() => void disableMember(m.membership_id)}>{t('btnDisableMember')}</Button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isAdmin && (
        <div className="row gap wrap">
          <Button variant="primary" onClick={() => setShowInvite(true)}>
            <span className="btn-icon-text"><IconPlus size={13} /> {t('btnInviteMember')}</span>
          </Button>
        </div>
      )}
      {showInvite && isAdmin && (
        <Modal title={t('inviteModalTitle')} onClose={() => setShowInvite(false)}>
          <div className="col gap">
            <Field label={t('fieldInvitee')}>
              <TextInput value={invitee} onChange={(e) => setInvitee(e.target.value)} placeholder="olivia" />
            </Field>
            <Field label={t('fieldTenantRole')}>
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{roleLabel(t, r)}</option>)}
              </Select>
            </Field>
            <Button variant="primary" disabled={!invitee.trim()} onClick={() => void invite()}>{t('btnCreateInvite')}</Button>
            <p className="muted">{t('inviteNote')}</p>
          </div>
        </Modal>
      )}
      {inviteToken && (
        <div className="banner banner-warn">
          <strong>{t('inviteTokenBanner')}</strong>
          <code className="mono" style={{ wordBreak: 'break-all' }}>{inviteToken}</code>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
      {!isAdmin && memberships.length > 1 && (
        <div className="row gap wrap">
          <span className="muted">{t('switchTenant')}</span>
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
  const { t } = useLang()
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
    <Card title={t('usageCardTitle')} subtitle={t('usageCardSub')}>
      {!loaded ? (
        <p className="muted">{t('loading')}</p>
      ) : buckets.length === 0 ? (
        <p className="muted">{t('usageEmptyHint')}</p>
      ) : (
        <>
          <table className="table">
            <thead><tr><th>{t('thMetric')}</th><th>{t('thScopeType')}</th><th>{t('thPeriod')}</th><th>{t('thUsed')}</th><th>{t('thReserved')}</th><th>{t('thLimit')}</th></tr></thead>
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
  const { t, lang } = useLang()
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
      setMsg(approve ? t('supportApprovedMsg') : t('supportRejectedMsg'))
      await load()
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }

  return (
    <Card title={t('supportCardTitle')} subtitle={t('supportCardSub')}>
      {!loaded ? <p className="muted">{t('loading')}</p>
      : grants.length === 0 ? <p className="muted">{t('supportEmpty')}</p>
      : (
        <table className="table">
          <thead><tr><th>{t('thRequester')}</th><th>{t('thPurpose')}</th><th>{t('thTicket')}</th><th>{t('status')}</th><th>{t('thSessionExpires')}</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id}>
                <td><MonoText>{g.requested_by}</MonoText></td>
                <td>{g.purpose}</td>
                <td className="muted">{g.ticket || '—'}</td>
                <td><Badge tone={g.status === 'active' ? 'ok' : g.status === 'requested' ? 'warn' : g.status === 'approved' ? 'info' : 'neutral'}>{g.status}</Badge></td>
                <td className="muted">{g.session_expires_at ? new Date(g.session_expires_at as string).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en', { hour12: false }) : '—'}</td>
                {isAdmin && (
                  <td>
                    {g.status === 'requested' && g.can_decide && (
                      <div className="row gap">
                        <Button className="btn-xs" variant="primary" onClick={() => void decide(g.id, true)}>{t('btnApprove')}</Button>
                        <Button className="btn-xs" variant="danger" onClick={() => void decide(g.id, false)}>{t('btnReject')}</Button>
                      </div>
                    )}
                    {g.requested_by === identityUser?.id && g.status === 'requested' && (
                      <span className="muted">{t('waitingApproval')}</span>
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
