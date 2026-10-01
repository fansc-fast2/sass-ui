// 插件管理（运营面）：渠道安装绑定（注册/卸载/epoch）、插件用户（绑定租户
// 成员）、插件运行时（执行器）、计量与参考成本。
// 诚实边界：付费情况 = 计量聚合 + 参考价估算（estimated 标记），非账单、
// 不代表订阅费；插件业务端内用户（如 Dealer）平台侧暂不可见。

import { useEffect, useState } from 'react'
import {
  opsChannelInstallationDetail, opsCreateChannelInstallation, opsListChannelInstallations,
  opsListTenants, opsPluginsOverview, opsUninstallChannelInstallation,
} from './opsClient'
import type { ChannelInstallRow, PluginsOverview } from './opsClient'
import { Modal } from '../components/Modal'
import { IconArrowRight, IconPlus } from '../components/icons'
import { useLang } from '../i18n'
import { langTag } from '../i18n'

const INSTALL_TONES: Record<string, string> = { active: 'badge-ok', uninstalled: 'badge-neutral' }

export default function PluginsPage({ isAdmin }: { isAdmin: boolean }) {
  const { t, lang } = useLang()
  const [overview, setOverview] = useState<PluginsOverview | null>(null)
  const [installs, setInstalls] = useState<ChannelInstallRow[] | null>(null)
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [statusFilter, setStatusFilter] = useState('')
  const [tenantFilter, setTenantFilter] = useState('')

  const [newTenant, setNewTenant] = useState('')
  const [newShop, setNewShop] = useState('')
  const [newDomain, setNewDomain] = useState('')
  const [newReg, setNewReg] = useState('car-test-ride-app-1')
  const [createMsg, setCreateMsg] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const [detail, setDetail] = useState<ChannelInstallRow | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  const query = async () => {
    setBusy(true)
    setError(null)
    try {
      const [ov, list, ts] = await Promise.all([
        opsPluginsOverview(),
        opsListChannelInstallations({ status: statusFilter || undefined, tenant_id: tenantFilter || undefined }),
        opsListTenants(),
      ])
      setOverview(ov)
      setInstalls(list.items)
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

  const create = async () => {
    setCreateMsg(null)
    setError(null)
    try {
      const ci = await opsCreateChannelInstallation({
        tenant_id: newTenant.trim(), shop_stable_id: newShop.trim(),
        canonical_shop_domain: newDomain.trim() || newShop.trim(),
        channel_app_registration_id: newReg.trim(),
      })
      setCreateMsg(t('installBoundMsg', { shop: ci.shop_stable_id, tenant: ci.tenant_id, epoch: ci.installation_epoch }))
      setNewShop('')
      setNewDomain('')
      setShowCreate(false)
      await query()
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const uninstall = async (row: ChannelInstallRow) => {
    if (!window.confirm(t('confirmUninstall', { shop: row.shop_stable_id }))) return
    setDetailError(null)
    try {
      await opsUninstallChannelInstallation({
        channel_app_registration_id: row.registration_id, shop_stable_id: row.shop_stable_id,
      })
      setDetail(null)
      await query()
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    }
  }

  const openDetail = async (id: string) => {
    setDetailError(null)
    try {
      setDetail(await opsChannelInstallationDetail(id))
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="page">
      {error && <div className="banner banner-err">{error}</div>}

      {/* 总览 */}
      <div className="card">
        <div className="card-body">
          <strong>{t('pluginsOverviewTitle')}</strong>
          {overview ? (
            <div className="row gap wrap" style={{ marginTop: 8 }}>
              <span className="badge badge-ok">{t('activeInstallsBadge', { count: overview.installations.active })}</span>
              <span className="badge badge-neutral">{t('uninstalledBadge', { count: overview.installations.uninstalled })}</span>
              <span className="badge badge-neutral">{t('tenantsWithPluginBadge', { count: overview.tenants_with_plugin })}</span>
              <span className="badge badge-neutral">{t('kernelInstallsBadge', { count: overview.kernel_installations })}</span>
              {overview.registrations.map((m) => (
                <span key={m.plugin_key} className="badge badge-warn">
                  {m.plugin_key}@{m.plugin_version}（{m.supported_channels.join('/')}）
                </span>
              ))}
            </div>
          ) : <p className="muted">{t('loading')}</p>}
          <p className="muted" style={{ marginTop: 8 }}>
            {t('pluginsOverviewNote')}
          </p>
        </div>
      </div>

      {/* 安装列表 */}
      <div className="card">
        <div className="card-body">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{t('installsTitle')}</strong>
            <button className="btn btn-primary" disabled={!isAdmin} onClick={() => setShowCreate(true)}>
              <span className="btn-icon-text"><IconPlus size={13} /> {t('btnRegisterInstall')}</span>
            </button>
          </div>
          <div className="row gap wrap">
            <select className="input select" style={{ width: 150 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">{t('optAllStatus')}</option>
              <option value="active">active</option>
              <option value="uninstalled">uninstalled</option>
            </select>
            <input className="input" style={{ width: 160 }} placeholder={t('phTenantIdFilter')} value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} />
            <button className="btn" disabled={busy} onClick={() => void query()}>{busy ? t('querying') : t('query')}</button>
          </div>
          {createMsg && <p className="muted">{createMsg}</p>}
          {installs && installs.length > 0 && (
            <table className="table">
              <thead><tr><th>{t('thShop')}</th><th>{t('tenant')}</th><th>{t('thAppReg')}</th><th>{t('status')}</th><th>{t('thEpoch')}</th><th>{t('thInstalledAt')}</th><th></th></tr></thead>
              <tbody>
                {installs.map((ci) => (
                  <tr key={ci.id}>
                    <td><code className="mono">{ci.shop_stable_id}</code><br /><span className="muted">{ci.canonical_shop_domain}</span></td>
                    <td><code className="mono">{ci.tenant_id}</code></td>
                    <td>{ci.registration_id}</td>
                    <td><span className={`badge ${INSTALL_TONES[ci.status] ?? 'badge-neutral'}`}>{ci.status}</span></td>
                    <td>{ci.installation_epoch}</td>
                    <td className="muted">{new Date(ci.installed_at).toLocaleString(langTag(lang), { hour12: false })}</td>
                    <td>
                      <button className="btn btn-xs" onClick={() => void openDetail(ci.id)}>{t('detail')}</button>
                      {isAdmin && ci.status === 'active' && (
                        <button className="btn btn-xs btn-danger" style={{ marginLeft: 6 }} onClick={() => void uninstall(ci)}>{t('btnUninstall')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {installs && installs.length === 0 && <p className="muted">{t('noMatchingInstalls')}</p>}
        </div>
      </div>

      {/* 详情：插件用户 / 运行时 / 付费估算 */}
      {detail && (
        <div className="card">
          <div className="card-body">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{t('installDetailTitle')} <code className="mono">{detail.id}</code></strong>
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>{t('btnCollapse')}</button>
            </div>
            {detailError && <div className="banner banner-err">{detailError}</div>}

            <div className="result-col">
              <div className="result-row"><span className="result-label">{t('labelShopTenant')}</span>
                <span className="result-value"><code className="mono">{detail.shop_stable_id}</code>
                  <span className="inline-arrow" aria-hidden><IconArrowRight size={12} /></span>
                  <code className="mono">{detail.tenant_id}</code>
                  {detail.tenant && <>（{detail.tenant.name} · <span className={`badge ${STATUS_TONES[detail.tenant.status] ?? 'badge-neutral'}`}>{detail.tenant.status}</span> · {detail.tenant.plan_id || t('noPlan')}）</>}
                </span></div>
              <div className="result-row"><span className="result-label">{t('labelAuthStatus')}</span>
                <span className="result-value">{detail.auth_status} · epoch {detail.installation_epoch}</span></div>
            </div>

            <strong>{t('pluginUsersTitle')}</strong>
            <p className="muted">{t('pluginUsersNote')}</p>
            {(detail.members?.length ?? 0) > 0 ? (
              <table className="table">
                <thead><tr><th>{t('member')}</th><th>{t('role')}</th><th>{t('status')}</th><th>{t('thJoinedAt')}</th></tr></thead>
                <tbody>
                  {detail.members!.map((m) => (
                    <tr key={m.membership_id}>
                      <td><code className="mono">{m.subject_id}</code></td>
                      <td>{m.role}</td>
                      <td>{m.status}</td>
                      <td className="muted">{new Date(m.joined_at).toLocaleString(langTag(lang), { hour12: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">{t('tenantNoMembers')}</p>}

            <strong>{t('executorsTitle')}</strong>
            {(detail.executors?.length ?? 0) > 0 ? (
              <table className="table">
                <thead><tr><th>{t('thExecutor')}</th><th>{t('thSite')}</th><th>{t('thAudience')}</th><th>{t('status')}</th><th>{t('thProtocol')}</th></tr></thead>
                <tbody>
                  {detail.executors!.map((e) => (
                    <tr key={e.executor_id}>
                      <td><code className="mono">{e.executor_id}</code></td>
                      <td><code className="mono">{e.site_id}</code></td>
                      <td><code className="mono">{e.audience}</code></td>
                      <td><span className={`badge ${e.status === 'active' ? 'badge-ok' : 'badge-neutral'}`}>{e.status}</span></td>
                      <td>{e.protocol_range}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">{t('noExecutors')}</p>}

            {(detail.plugin_installations?.length ?? 0) > 0 && (
              <>
                <strong>{t('kernelInstallsTitle')}</strong>
                <table className="table">
                  <thead><tr><th>{t('thPlugin')}</th><th>{t('version')}</th><th>{t('status')}</th><th>{t('thEpoch')}</th><th>{t('thSite')}</th></tr></thead>
                  <tbody>
                    {detail.plugin_installations!.map((p) => (
                      <tr key={p.id}>
                        <td><code className="mono">{p.plugin_key}</code></td>
                        <td>{p.plugin_version}</td>
                        <td>{p.status}</td>
                        <td>{p.installation_epoch}</td>
                        <td><code className="mono">{p.site_id}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <strong>{t('paymentTitle')}</strong>
            {(detail.usage?.length ?? 0) === 0 ? (
              <p className="muted">{t('noMetering')}</p>
            ) : (
              <>
                <table className="table">
                  <thead><tr><th>{t('thMetricName')}</th><th>{t('thQty')}</th><th>{t('thQualityCols')}</th><th>{t('thEvents')}</th><th>{t('thLatest')}</th></tr></thead>
                  <tbody>
                    {detail.usage!.map((u) => (
                      <tr key={u.metric}>
                        <td><code className="mono">{u.metric}</code></td>
                        <td>{u.total} {u.unit}</td>
                        <td className="muted">
                          {u.by_quality.confirmed ?? 0} / {u.by_quality.estimated ?? 0} / {u.by_quality.unknown ?? 0}
                          {(u.by_quality.unknown ?? 0) > 0 && <span className="badge badge-warn" style={{ marginLeft: 6 }}>{t('unknownPendingBadge')}</span>}
                        </td>
                        <td>{u.event_count}</td>
                        <td className="muted">{new Date(u.last_at).toLocaleString(langTag(lang), { hour12: false })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.cost_estimate && detail.cost_estimate.lines.length > 0 && (
                  <p>
                    {t('costTotalLine', { total: detail.cost_estimate.estimated_total.toFixed(2), currency: detail.cost_estimate.currency })}
                    <span className="badge badge-warn" style={{ marginLeft: 6 }}>estimated</span>
                    <span className="muted">（{detail.cost_estimate.note}）</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 注册安装：弹窗承载 */}
      {showCreate && (
        <Modal title={t('registerInstallTitle')} onClose={() => setShowCreate(false)} wide>
          <div className="col gap">
            <label className="field"><span className="field-label">{t('fieldTenantPick')}</span>
              <select className="input select" value={newTenant} onChange={(e) => setNewTenant(e.target.value)}>
                <option value="">{t('optChooseTenant')}</option>
                {tenants.map((x) => <option key={x.id} value={x.id}>{x.name}（{x.id}）</option>)}
              </select></label>
            <label className="field"><span className="field-label">{t('fieldShopId')}</span>
              <input className="input" value={newShop} onChange={(e) => setNewShop(e.target.value)} placeholder="shop-demo.myshopify.com" /></label>
            <label className="field"><span className="field-label">{t('fieldCanonicalDomain')}</span>
              <input className="input" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} /></label>
            <label className="field"><span className="field-label">{t('fieldAppRegId')}</span>
              <input className="input" value={newReg} onChange={(e) => setNewReg(e.target.value)} /></label>
            <button
              className="btn btn-primary"
              disabled={!isAdmin || busy || !newTenant || !newShop.trim() || !newReg.trim()}
              onClick={() => void create()}
            >
              {t('btnBind')}
            </button>
            <p className="muted">{t('bindIdempotentNote')}</p>
          </div>
        </Modal>
      )}
    </div>
  )
}

const STATUS_TONES: Record<string, string> = {
  active: 'badge-ok', provisioning: 'badge-warn', suspended: 'badge-err', closing: 'badge-warn', closed: 'badge-neutral',
}
