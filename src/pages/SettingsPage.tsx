// 设置（/settings，底部导航）：身份会话信息、权威成员关系（服务端目录）、
// 接口一览。租户目录/成员治理的权威在平台控制面（ADR-17），本页不提供伪造目录。

import { Badge, Card, MonoText } from '../components/ui'
import { LoginFlow } from '../components/LoginFlow'
import { PERM_LABELS } from '../session/permissions'
import { ROLE_LABELS } from '../session/permissions'
import { useSession } from '../session/SessionContext'

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
  const { hasScope, active, identityUser, memberships, selectTenant, logout } = useSession()

  return (
    <div className="page">
      <Card title="身份会话" subtitle="IdentityContext（登录会话）与 TenantContext（租户绑定会话）分离；会话凭据只存本标签页 sessionStorage">
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

      <Card
        title="我的成员关系"
        subtitle="GET /v1/me/memberships · 权威目录来自平台控制面（ADR-17）；点击切换租户上下文"
      >
        {memberships.length === 0 ? (
          <p className="muted">还没有成员关系——登录后自动加载；没有则联系目标租户的管理员邀请你。</p>
        ) : (
          <table className="table">
            <thead><tr><th>租户</th><th>角色</th><th>状态</th><th>套餐</th><th></th></tr></thead>
            <tbody>
              {memberships.map((m) => {
                const isCurrent = active?.tenantId === m.tenant_id
                return (
                  <tr key={m.membership_id} className={isCurrent ? 'row-current' : ''}>
                    <td><strong>{m.tenant_name}</strong>{isCurrent && <> <Badge tone="ok">当前</Badge></>}</td>
                    <td>{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}</td>
                    <td><Badge tone={m.status === 'active' ? 'ok' : 'warn'}>{m.status}</Badge></td>
                    <td>{m.plan_id || '—'}</td>
                    <td>
                      {isCurrent
                        ? <Badge tone="ok">使用中</Badge>
                        : <button className="btn btn-xs btn-primary" onClick={() => void selectTenant(m.membership_id)}>进入</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="接口一览" subtitle="后端 devkit v1.8 的 31 个 /v1 操作；✓ = 当前角色具备所需权限（另有 /ops/v1 平台域，仅平台身份可用）">
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
                <td>{hasScope(r.perm) ? <Badge tone="ok">✓</Badge> : <Badge tone="warn">✗</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
