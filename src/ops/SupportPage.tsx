// 支持授权工作台（F1）：运营发起 → 租户管理员审批（租户侧）→ 15 分钟只读
// 会话 → 撤销。规则：会话短期到期（15 分钟）、全程审计、租户拒绝即终止；
// 授权是"租户批准的例外"，不是平台特权（v0.2 §6）。

import { useEffect, useState } from 'react'
import {
  opsAllSupportGrants, opsCreateSupportSession, opsListTenants,
  opsRequestSupportGrant, opsRevokeSupportGrant,
} from './opsClient'
import type { SupportGrantView } from './opsClient'
import { Modal } from '../components/Modal'

const GRANT_TONES: Record<string, string> = {
  requested: 'badge-warn',
  approved: 'badge-ok',
  active: 'badge-ok',
  revoked: 'badge-neutral',
  rejected: 'badge-err',
  expired: 'badge-neutral',
}

const GRANT_LABELS: Record<string, string> = {
  requested: '待租户审批',
  approved: '租户已批准（可建会话）',
  active: '会话进行中',
  revoked: '已撤销',
  rejected: '租户已拒绝',
  expired: '会话已过期',
}

export default function SupportPage() {
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [grants, setGrants] = useState<SupportGrantView[] | null>(null)
  const [tenantFilter, setTenantFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [reqTenant, setReqTenant] = useState('')
  const [reqPurpose, setReqPurpose] = useState('')
  const [reqTicket, setReqTicket] = useState('')
  const [reqMsg, setReqMsg] = useState<string | null>(null)
  const [showReq, setShowReq] = useState(false)

  const [session, setSession] = useState<{ grantId: string; token: string; expiresAt: string } | null>(null)

  const query = async () => {
    setBusy(true)
    setError(null)
    try {
      const [list, ts] = await Promise.all([
        opsAllSupportGrants({ tenant_id: tenantFilter || undefined }),
        opsListTenants(),
      ])
      setGrants(list.items)
      setTenants(ts.items.map((t) => ({ id: t.id, name: t.name })))
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

  const request = async () => {
    setReqMsg(null)
    setError(null)
    try {
      const g = await opsRequestSupportGrant(reqTenant.trim(), {
        purpose: reqPurpose.trim(), ticket: reqTicket.trim(),
      })
      setReqMsg(`已发起授权申请 ${g.id}（${g.status}）——等待租户管理员在租户侧审批`)
      setReqPurpose('')
      setShowReq(false)
      await query()
    } catch (e) {
      setReqMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const openSession = async (g: SupportGrantView) => {
    setError(null)
    try {
      const s = await opsCreateSupportSession(g.id)
      setSession({ grantId: g.id, token: s.support_session, expiresAt: s.expires_at })
      await query()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const revoke = async (g: SupportGrantView) => {
    if (!window.confirm(`撤销授权 ${g.id}？进行中的支持会话立即失效。`)) return
    setError(null)
    try {
      await opsRevokeSupportGrant(g.id)
      if (session?.grantId === g.id) setSession(null)
      await query()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="page">
      {error && <div className="banner banner-err">{error}</div>}

      <div className="card">
        <div className="card-body">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>发起支持授权</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                支持访问是"租户批准的例外"：租户侧审批后才可建立 15 分钟只读会话，全程审计。
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowReq(true)}>＋ 发起申请</button>
          </div>
          {reqMsg && <p className="muted">{reqMsg}</p>}
        </div>
      </div>

      {showReq && (
        <Modal title="发起支持授权" onClose={() => setShowReq(false)}>
          <div className="col gap">
            <label className="field"><span className="field-label">租户</span>
              <select className="input select" value={reqTenant} onChange={(e) => setReqTenant(e.target.value)}>
                <option value="">选择租户…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.id}）</option>)}
              </select></label>
            <label className="field"><span className="field-label">访问目的（必填）</span>
              <input className="input" value={reqPurpose} onChange={(e) => setReqPurpose(e.target.value)} placeholder="排查订单同步异常" /></label>
            <label className="field"><span className="field-label">关联工单号（必填）</span>
              <input className="input" value={reqTicket} onChange={(e) => setReqTicket(e.target.value)} placeholder="TICKET-1024" /></label>
            <button
              className="btn btn-primary"
              disabled={busy || !reqTenant || !reqPurpose.trim() || !reqTicket.trim()}
              onClick={() => void request()}
            >
              提交申请
            </button>
            <p className="muted">
              申请后由租户管理员在租户侧审批，批准后才能建立 15 分钟只读会话；
              全程记入双方审计，租户可随时拒绝或撤销。
            </p>
          </div>
        </Modal>
      )}

      {session && (
        <div className="card">
          <div className="card-body">
            <strong>支持会话已建立 <span className="badge badge-warn">15 分钟有效</span></strong>
            <div className="result-col">
              <div className="result-row"><span className="result-label">会话令牌</span>
                <span className="result-value"><code className="mono" style={{ wordBreak: 'break-all' }}>{session.token}</code></span></div>
              <div className="result-row"><span className="result-label">到期时间</span>
                <span className="result-value muted">{new Date(session.expiresAt).toLocaleString('zh-CN', { hour12: false })}</span></div>
              <div className="result-row"><span className="result-label">用途</span>
                <span className="result-value">短期只读（read_only）租户上下文；操作全部记入审计</span></div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <div className="row gap wrap">
            <input className="input" style={{ width: 160 }} placeholder="tenant_id 筛选" value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} onClick={() => void query()}>{busy ? '查询中…' : '刷新'}</button>
          </div>
          {grants && grants.length > 0 && (
            <table className="table">
              <thead><tr><th>租户</th><th>目的 / 工单</th><th>状态</th><th>权限</th><th>发起 / 审批</th><th></th></tr></thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id}>
                    <td><code className="mono">{g.tenant_id}</code></td>
                    <td>{g.purpose}<br /><span className="muted">{g.ticket}</span></td>
                    <td><span className={`badge ${GRANT_TONES[g.status] ?? 'badge-neutral'}`}>
                      {g.status} · {GRANT_LABELS[g.status] ?? ''}
                    </span>
                      {g.session_expires_at && g.status === 'active' && (
                        <div className="muted">到期 {new Date(g.session_expires_at).toLocaleTimeString('zh-CN', { hour12: false })}</div>
                      )}
                    </td>
                    <td>{g.permission}</td>
                    <td className="muted">
                      {g.requested_by}{g.approved_by ? ` → ${g.approved_by}` : ''}<br />
                      {new Date(g.created_at).toLocaleString('zh-CN', { hour12: false })}
                    </td>
                    <td>
                      {(g.status === 'approved' || g.status === 'active') && (
                        <button className="btn btn-xs" onClick={() => void openSession(g)}>建立会话</button>
                      )}
                      {(g.status === 'requested' || g.status === 'approved' || g.status === 'active') && (
                        <button className="btn btn-xs btn-danger" style={{ marginLeft: 6 }} onClick={() => void revoke(g)}>撤销</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {grants && grants.length === 0 && <p className="muted">还没有支持授权记录</p>}
        </div>
      </div>
    </div>
  )
}
