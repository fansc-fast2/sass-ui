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

const INSTALL_TONES: Record<string, string> = { active: 'badge-ok', uninstalled: 'badge-neutral' }

export default function PluginsPage({ isAdmin }: { isAdmin: boolean }) {
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

  const create = async () => {
    setCreateMsg(null)
    setError(null)
    try {
      const ci = await opsCreateChannelInstallation({
        tenant_id: newTenant.trim(), shop_stable_id: newShop.trim(),
        canonical_shop_domain: newDomain.trim() || newShop.trim(),
        channel_app_registration_id: newReg.trim(),
      })
      setCreateMsg(`已绑定 ${ci.shop_stable_id} → ${ci.tenant_id}（epoch ${ci.installation_epoch}）`)
      setNewShop('')
      setNewDomain('')
      await query()
    } catch (e) {
      setCreateMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const uninstall = async (row: ChannelInstallRow) => {
    if (!window.confirm(`卸载 ${row.shop_stable_id}？epoch 将递增，旧授权/在途命令全部失效。`)) return
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
          <strong>插件总览</strong>
          {overview ? (
            <div className="row gap wrap" style={{ marginTop: 8 }}>
              <span className="badge badge-ok">有效安装 {overview.installations.active}</span>
              <span className="badge badge-neutral">已卸载 {overview.installations.uninstalled}</span>
              <span className="badge badge-neutral">接入插件租户 {overview.tenants_with_plugin}</span>
              <span className="badge badge-neutral">内核安装记录 {overview.kernel_installations}</span>
              {overview.registrations.map((m) => (
                <span key={m.plugin_key} className="badge badge-warn">
                  {m.plugin_key}@{m.plugin_version}（{m.supported_channels.join('/')}）
                </span>
              ))}
            </div>
          ) : <p className="muted">加载中…</p>}
          <p className="muted" style={{ marginTop: 8 }}>
            付费情况为计量聚合 + 参考价估算（estimated），非账单；Shopify Billing 订阅对账未接入。
          </p>
        </div>
      </div>

      {/* 安装列表 */}
      <div className="card">
        <div className="card-body">
          <div className="row gap wrap">
            <select className="input select" style={{ width: 150 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">（全部状态）</option>
              <option value="active">active</option>
              <option value="uninstalled">uninstalled</option>
            </select>
            <input className="input" style={{ width: 160 }} placeholder="tenant_id（如 t_1）" value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} onClick={() => void query()}>{busy ? '查询中…' : '查询'}</button>
          </div>
          {installs && installs.length > 0 && (
            <table className="table">
              <thead><tr><th>店铺</th><th>租户</th><th>App 注册</th><th>状态</th><th>epoch</th><th>安装时间</th><th></th></tr></thead>
              <tbody>
                {installs.map((ci) => (
                  <tr key={ci.id}>
                    <td><code className="mono">{ci.shop_stable_id}</code><br /><span className="muted">{ci.canonical_shop_domain}</span></td>
                    <td><code className="mono">{ci.tenant_id}</code></td>
                    <td>{ci.registration_id}</td>
                    <td><span className={`badge ${INSTALL_TONES[ci.status] ?? 'badge-neutral'}`}>{ci.status}</span></td>
                    <td>{ci.installation_epoch}</td>
                    <td className="muted">{new Date(ci.installed_at).toLocaleString('zh-CN', { hour12: false })}</td>
                    <td>
                      <button className="btn btn-xs" onClick={() => void openDetail(ci.id)}>详情</button>
                      {isAdmin && ci.status === 'active' && (
                        <button className="btn btn-xs btn-danger" style={{ marginLeft: 6 }} onClick={() => void uninstall(ci)}>卸载</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {installs && installs.length === 0 && <p className="muted">没有匹配的安装绑定</p>}
        </div>
      </div>

      {/* 详情：插件用户 / 运行时 / 付费估算 */}
      {detail && (
        <div className="card">
          <div className="card-body">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>安装详情 <code className="mono">{detail.id}</code></strong>
              <button className="btn btn-ghost" onClick={() => setDetail(null)}>收起</button>
            </div>
            {detailError && <div className="banner banner-err">{detailError}</div>}

            <div className="result-col">
              <div className="result-row"><span className="result-label">店铺 / 租户</span>
                <span className="result-value"><code className="mono">{detail.shop_stable_id}</code> → <code className="mono">{detail.tenant_id}</code>
                  {detail.tenant && <>（{detail.tenant.name} · <span className={`badge ${STATUS_TONES[detail.tenant.status] ?? 'badge-neutral'}`}>{detail.tenant.status}</span> · {detail.tenant.plan_id || '无套餐'}）</>}
                </span></div>
              <div className="result-row"><span className="result-label">授权状态</span>
                <span className="result-value">{detail.auth_status} · epoch {detail.installation_epoch}</span></div>
            </div>

            <strong>插件用户（绑定租户成员）</strong>
            <p className="muted">平台侧可见的是使用该插件实例的租户成员；插件业务端内用户（如 Dealer/客户）在插件业务库，平台不持有。</p>
            {(detail.members?.length ?? 0) > 0 ? (
              <table className="table">
                <thead><tr><th>成员</th><th>角色</th><th>状态</th><th>加入时间</th></tr></thead>
                <tbody>
                  {detail.members!.map((m) => (
                    <tr key={m.membership_id}>
                      <td><code className="mono">{m.subject_id}</code></td>
                      <td>{m.role}</td>
                      <td>{m.status}</td>
                      <td className="muted">{new Date(m.joined_at).toLocaleString('zh-CN', { hour12: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">该租户暂无成员</p>}

            <strong>插件运行时（执行器）</strong>
            {(detail.executors?.length ?? 0) > 0 ? (
              <table className="table">
                <thead><tr><th>执行器</th><th>站点</th><th>audience</th><th>状态</th><th>协议</th></tr></thead>
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
            ) : <p className="muted">该租户暂无执行器注册（子站命令领取不可用）</p>}

            {(detail.plugin_installations?.length ?? 0) > 0 && (
              <>
                <strong>插件内核安装</strong>
                <table className="table">
                  <thead><tr><th>插件</th><th>版本</th><th>状态</th><th>epoch</th><th>站点</th></tr></thead>
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

            <strong>付费情况（参考估算）</strong>
            {(detail.usage?.length ?? 0) === 0 ? (
              <p className="muted">尚未接入计量（不显示 0）</p>
            ) : (
              <>
                <table className="table">
                  <thead><tr><th>计量</th><th>总量</th><th>confirmed / estimated / unknown</th><th>事件数</th><th>最近</th></tr></thead>
                  <tbody>
                    {detail.usage!.map((u) => (
                      <tr key={u.metric}>
                        <td><code className="mono">{u.metric}</code></td>
                        <td>{u.total} {u.unit}</td>
                        <td className="muted">
                          {u.by_quality.confirmed ?? 0} / {u.by_quality.estimated ?? 0} / {u.by_quality.unknown ?? 0}
                          {(u.by_quality.unknown ?? 0) > 0 && <span className="badge badge-warn" style={{ marginLeft: 6 }}>未知待核对</span>}
                        </td>
                        <td>{u.event_count}</td>
                        <td className="muted">{new Date(u.last_at).toLocaleString('zh-CN', { hour12: false })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.cost_estimate && detail.cost_estimate.lines.length > 0 && (
                  <p>
                    参考成本合计 <strong>{detail.cost_estimate.estimated_total.toFixed(2)}</strong> {detail.cost_estimate.currency}
                    <span className="badge badge-warn" style={{ marginLeft: 6 }}>estimated</span>
                    <span className="muted">（{detail.cost_estimate.note}）</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 注册安装 */}
      <div className="card">
        <div className="card-body">
          <strong>注册安装绑定</strong>
          <p className="muted">幂等：同 App 注册+店铺已绑同一租户时返回原绑定；换租户必须先卸载重装。</p>
          <div className="row gap wrap">
            <select className="input select" style={{ width: 170 }} value={newTenant} onChange={(e) => setNewTenant(e.target.value)}>
              <option value="">选择租户…</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}（{t.id}）</option>)}
            </select>
            <input className="input" style={{ width: 210 }} placeholder="店铺稳定 ID（如 shop-demo.myshopify.com）" value={newShop} onChange={(e) => setNewShop(e.target.value)} />
            <input className="input" style={{ width: 180 }} placeholder="规范域名（可留空同店铺 ID）" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
            <input className="input" style={{ width: 200 }} placeholder="App 注册 ID" value={newReg} onChange={(e) => setNewReg(e.target.value)} />
            <button
              className="btn btn-primary"
              disabled={!isAdmin || busy || !newTenant || !newShop.trim() || !newReg.trim()}
              onClick={() => void create()}
            >
              绑定（幂等）
            </button>
          </div>
          {!isAdmin && <p className="muted">注册/卸载需要 platform_admin 角色。</p>}
          {createMsg && <p className="muted">{createMsg}</p>}
        </div>
      </div>
    </div>
  )
}

const STATUS_TONES: Record<string, string> = {
  active: 'badge-ok', provisioning: 'badge-warn', suspended: 'badge-err', closing: 'badge-warn', closed: 'badge-neutral',
}
