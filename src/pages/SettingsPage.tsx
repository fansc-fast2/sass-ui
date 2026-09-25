// 设置（/settings，底部导航）：团队/连接授权等复用现有控制层；本页承载
// 租户注册表（Q06 接入前的本机管理）、测试凭据、连接能力查询与接口一览。

import { useState } from 'react'
import { getCapabilities } from '../api/api'
import type { Capabilities } from '../api/types'
import { PERM_LABELS } from '../session/permissions'
import { ROLE_LABELS, ROLES } from '../session/permissions'
import type { Role } from '../session/permissions'
import { useSession } from '../session/SessionContext'
import { useTenantRegistry } from '../tenants/registry'
import { useApiOperation } from '../state/useApiOperation'
import {
  Badge, Button, Card, ErrorBanner, Field, JsonView, MonoText, ResultRow, Select, TextInput,
} from '../components/ui'
import { CredentialPanel } from '../components/CredentialPanel'

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
  const { session, save } = useSession()
  const { tenants, upsert, remove } = useTenantRegistry()
  const { loading, error, run } = useApiOperation()

  const [formTenant, setFormTenant] = useState('')
  const [formActor, setFormActor] = useState('frank')
  const [formRole, setFormRole] = useState<Role>('publisher')
  const [formSites, setFormSites] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [armedDelete, setArmedDelete] = useState<string | null>(null)

  const [connId, setConnId] = useState('cms-main')
  const [caps, setCaps] = useState<Capabilities | null>(null)

  const submitForm = (enter: boolean) => {
    const t = formTenant.trim()
    const a = formActor.trim()
    if (!t || !a) return
    const sites = formSites.split(/[，,]/).map((s) => s.trim()).filter(Boolean)
    const entry = { tenant: t, actor: a, role: formRole, sites }
    upsert(entry)
    if (enter) save(entry)
    setFormTenant('')
    setFormSites('')
    setEditing(null)
  }

  const enterTenant = (tenant: string) => {
    const entry = tenants.find((t) => t.tenant === tenant)
    if (!entry) return
    upsert(entry)
    save({ tenant: entry.tenant, actor: entry.actor, role: entry.role, sites: entry.sites })
  }

  const queryCaps = async () => {
    if (!connId.trim()) return
    const res = await run('GET', `/v1/connections/${connId.trim()}/capabilities`, () => getCapabilities(connId.trim()))
    if (res) setCaps(res.data)
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />

      <Card
        title="租户注册表"
        subtitle="租户是全局安全边界（19 §2）；身份控制面 Q06 接入前由浏览器本地维护，接入后平移为真实 API。切换租户会取消旧请求并清空旧租户缓存。"
      >
        {tenants.length === 0 ? (
          <p className="muted">还没有注册租户——用下方表单新增第一个租户。</p>
        ) : (
          <table className="table">
            <thead><tr><th>租户</th><th>用户 / 角色</th><th>站点</th><th>最近使用</th><th></th></tr></thead>
            <tbody>
              {tenants.map((t) => {
                const isCurrent = session?.tenant === t.tenant
                return (
                  <tr key={t.tenant} className={isCurrent ? 'row-current' : ''}>
                    <td><strong>{t.tenant}</strong>{isCurrent && <> <Badge tone="ok">当前</Badge></>}</td>
                    <td>{t.actor} · {ROLE_LABELS[t.role]}</td>
                    <td>{t.sites.length > 0 ? t.sites.join(', ') : <span className="muted">—</span>}</td>
                    <td className="muted">{new Date(t.lastUsedAt).toLocaleString('zh-CN', { hour12: false })}</td>
                    <td>
                      <div className="row gap">
                        {isCurrent
                          ? <Badge tone="ok">使用中</Badge>
                          : <Button className="btn-xs" variant="primary" onClick={() => enterTenant(t.tenant)}>进入</Button>}
                        <Button
                          className="btn-xs"
                          onClick={() => {
                            setEditing(t.tenant)
                            setFormTenant(t.tenant)
                            setFormActor(t.actor)
                            setFormRole(t.role)
                            setFormSites(t.sites.join(','))
                          }}
                        >
                          编辑
                        </Button>
                        {armedDelete === t.tenant ? (
                          <Button
                            className="btn-xs"
                            variant="danger"
                            onClick={() => {
                              remove(t.tenant)
                              setArmedDelete(null)
                            }}
                          >
                            确认删除
                          </Button>
                        ) : (
                          <Button className="btn-xs" variant="ghost" onClick={() => setArmedDelete(t.tenant)}>删除</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div className="tenant-form">
          <strong>{editing ? `编辑租户 ${editing}` : '新增租户'}</strong>
          <div className="grid-3">
            <Field label="租户 tenant">
              <TextInput value={formTenant} onChange={(e) => setFormTenant(e.target.value)} placeholder="acme" />
            </Field>
            <Field label="用户 actor">
              <TextInput value={formActor} onChange={(e) => setFormActor(e.target.value)} placeholder="frank" />
            </Field>
            <Field label="角色 role">
              <Select value={formRole} onChange={(e) => setFormRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="站点 sites" hint="可选，逗号分隔">
            <TextInput value={formSites} onChange={(e) => setFormSites(e.target.value)} placeholder="site-us,site-eu" />
          </Field>
          <div className="row gap">
            <Button
              variant="primary"
              disabled={!formTenant.trim() || !formActor.trim() || loading}
              onClick={() => submitForm(true)}
            >
              保存并进入
            </Button>
            <Button disabled={!formTenant.trim() || !formActor.trim()} onClick={() => submitForm(false)}>仅保存</Button>
            {editing && (
              <Button variant="ghost" onClick={() => { setEditing(null); setFormTenant(''); setFormSites('') }}>取消编辑</Button>
            )}
          </div>
          <p className="muted">
            凭据格式：<MonoText>test-cred:&lt;租户&gt;:&lt;用户&gt;:&lt;角色&gt;[:&lt;站点&gt;]</MonoText>（测试身份模拟器，M0 Q06）。
          </p>
        </div>
      </Card>

      <Card title="测试凭据" subtitle="角色阶梯 viewer→analyst→knowledge_reviewer→publisher（09 §1）">
        <CredentialPanel />
      </Card>

      <Card title="连接能力" subtitle="查询租户下 CMS 连接的写入管理模式；当前策略 detect_only（Q04：不自动写商品数据）">
        <div className="row gap">
          <TextInput
            value={connId}
            onChange={(e) => setConnId(e.target.value)}
            placeholder="connection_id，例如 cms-main"
            style={{ maxWidth: 320 }}
            onKeyDown={(e) => e.key === 'Enter' && void queryCaps()}
          />
          <Button variant="primary" disabled={loading || !connId.trim()} onClick={() => void queryCaps()}>查询能力</Button>
        </div>
        {caps && (
          <>
            <ResultRow label="connection_id"><MonoText>{caps.connection_id}</MonoText></ResultRow>
            <ResultRow label="管理模式"><Badge tone={caps.management_mode === 'auto' ? 'ok' : 'warn'}>{caps.management_mode}</Badge></ResultRow>
            <JsonView value={caps} label="响应 data" />
          </>
        )}
      </Card>

      <Card title="接口一览" subtitle="后端 devkit v1.5 的 31 个 /v1 契约操作；✓ = 当前角色具备所需权限">
        <table className="table">
          <thead>
            <tr><th>方法</th><th>路径</th><th>所需权限</th><th>当前角色</th></tr>
          </thead>
          <tbody>
            {ROUTES.map((r) => (
              <tr key={`${r.method} ${r.path}`}>
                <td><Badge tone={r.method === 'GET' ? 'neutral' : 'info'}>{r.method}</Badge></td>
                <td><MonoText>{r.path}</MonoText></td>
                <td>{r.perm}{PERM_LABELS[r.perm] ? ` · ${PERM_LABELS[r.perm]}` : ''}</td>
                <td>{session?.scopes.includes(r.perm) ? <Badge tone="ok">✓</Badge> : <Badge tone="warn">✗</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
