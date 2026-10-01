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
import { IconPlus } from '../components/icons'
import { useLang } from '../i18n'
import { langTag } from '../i18n'
import type { MsgKey } from '../i18n'

const GRANT_TONES: Record<string, string> = {
  requested: 'badge-warn',
  approved: 'badge-ok',
  active: 'badge-ok',
  revoked: 'badge-neutral',
  rejected: 'badge-err',
  expired: 'badge-neutral',
}

const GRANT_KEYS: Record<string, MsgKey> = {
  requested: 'grantRequested',
  approved: 'grantApproved',
  active: 'grantActive',
  revoked: 'grantRevoked',
  rejected: 'grantRejected',
  expired: 'grantExpired',
}

export default function SupportPage() {
  const { t, lang } = useLang()
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
      setTenants(ts.items.map((x) => ({ id: x.id, name: x.name })))
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
      setReqMsg(t('requestSubmittedMsg', { id: g.id, status: g.status }))
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
    if (!window.confirm(t('confirmRevokeGrant', { id: g.id }))) return
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
              <strong>{t('supportRequestTitle')}</strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {t('supportRequestNote')}
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowReq(true)}>
              <span className="btn-icon-text"><IconPlus size={13} /> {t('btnNewRequest')}</span>
            </button>
          </div>
          {reqMsg && <p className="muted">{reqMsg}</p>}
        </div>
      </div>

      {showReq && (
        <Modal title={t('supportRequestTitle')} onClose={() => setShowReq(false)}>
          <div className="col gap">
            <label className="field"><span className="field-label">{t('fieldTenantPick')}</span>
              <select className="input select" value={reqTenant} onChange={(e) => setReqTenant(e.target.value)}>
                <option value="">{t('optChooseTenant')}</option>
                {tenants.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.id}）</option>)}
              </select></label>
            <label className="field"><span className="field-label">{t('fieldPurpose')}</span>
              <input className="input" value={reqPurpose} onChange={(e) => setReqPurpose(e.target.value)} placeholder={t('phPurpose')} /></label>
            <label className="field"><span className="field-label">{t('fieldTicket')}</span>
              <input className="input" value={reqTicket} onChange={(e) => setReqTicket(e.target.value)} placeholder="TICKET-1024" /></label>
            <button
              className="btn btn-primary"
              disabled={busy || !reqTenant || !reqPurpose.trim() || !reqTicket.trim()}
              onClick={() => void request()}
            >
              {t('btnSubmitRequest')}
            </button>
            <p className="muted">
              {t('supportRequestNote2')}
            </p>
          </div>
        </Modal>
      )}

      {session && (
        <div className="card">
          <div className="card-body">
            <strong>{t('sessionCreatedTitle')} <span className="badge badge-warn">{t('sessionValidBadge')}</span></strong>
            <div className="result-col">
              <div className="result-row"><span className="result-label">{t('labelSessionToken')}</span>
                <span className="result-value"><code className="mono" style={{ wordBreak: 'break-all' }}>{session.token}</code></span></div>
              <div className="result-row"><span className="result-label">{t('labelExpiresAt')}</span>
                <span className="result-value muted">{new Date(session.expiresAt).toLocaleString(langTag(lang), { hour12: false })}</span></div>
              <div className="result-row"><span className="result-label">{t('thPurpose')}</span>
                <span className="result-value">{t('sessionPurposeNote')}</span></div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <div className="row gap wrap">
            <input className="input" style={{ width: 160 }} placeholder={t('phTenantFilter')} value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} onClick={() => void query()}>{busy ? t('querying') : t('refresh')}</button>
          </div>
          {grants && grants.length > 0 && (
            <table className="table">
              <thead><tr><th>{t('tenant')}</th><th>{t('thPurposeTicket')}</th><th>{t('status')}</th><th>{t('thPermission')}</th><th>{t('thRequestedApproved')}</th><th></th></tr></thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={g.id}>
                    <td><code className="mono">{g.tenant_id}</code></td>
                    <td>{g.purpose}<br /><span className="muted">{g.ticket}</span></td>
                    <td><span className={`badge ${GRANT_TONES[g.status] ?? 'badge-neutral'}`}>
                      {g.status} · {GRANT_KEYS[g.status] ? t(GRANT_KEYS[g.status]) : ''}
                    </span>
                      {g.session_expires_at && g.status === 'active' && (
                        <div className="muted">{t('expiresAtPrefix', { time: new Date(g.session_expires_at).toLocaleTimeString(langTag(lang), { hour12: false }) })}</div>
                      )}
                    </td>
                    <td>{g.permission}</td>
                    <td className="muted">
                      {g.requested_by}{g.approved_by ? ` ${t('approvedBySuffix', { by: g.approved_by })}` : ''}<br />
                      {new Date(g.created_at).toLocaleString(langTag(lang), { hour12: false })}
                    </td>
                    <td>
                      {(g.status === 'approved' || g.status === 'active') && (
                        <button className="btn btn-xs" onClick={() => void openSession(g)}>{t('btnOpenSession')}</button>
                      )}
                      {(g.status === 'requested' || g.status === 'approved' || g.status === 'active') && (
                        <button className="btn btn-xs btn-danger" style={{ marginLeft: 6 }} onClick={() => void revoke(g)}>{t('btnRevokeShort')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {grants && grants.length === 0 && <p className="muted">{t('noGrantsYet')}</p>}
        </div>
      </div>
    </div>
  )
}
