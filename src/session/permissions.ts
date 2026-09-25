// 客户端镜像 internal/identity/simulator.go 的角色阶梯（09_security §1 权限矩阵），
// 仅用于 UI 预判按钮可用性；服务端始终是权威，403 以接口返回为准。
// 凭据格式：test-cred:<租户>:<用户>:<角色>[:<站点 csv>]

export const ROLES = ['viewer', 'analyst', 'knowledge_reviewer', 'publisher', 'operations'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  viewer: '查看者 viewer',
  analyst: '分析师 analyst',
  knowledge_reviewer: '知识审核 knowledge_reviewer',
  publisher: '发布者 publisher',
  operations: '运维 operations',
}

export const PERM_LABELS: Record<string, string> = {
  'connection.read': '连接读取',
  'knowledge.read': '知识读取',
  'knowledge.sync': '知识同步',
  'knowledge.verify': '知识核验',
  'seo.audit': 'SEO 审计',
  'change.read': '变更读取',
  'change.propose': '变更提案',
  'change.authorize': '变更授权/撤销',
  'change.execute': '变更执行',
  'change.restore': '恢复提案',
  'job.read': '任务读取',
  'job.cancel': '任务取消',
  'self.read': '自身能力',
  'workspace.read': '工作台读取',
  'notification.read': '通知读取',
  'activity.read': '活动读取',
}

const LADDER: Record<Role, string[]> = {
  // v1.5：self.read 是导航依据（me/capabilities），workspace/notification/
  // activity 属查看者层（19 §6、20 §1）。
  viewer: ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read'],
  analyst: ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read', 'knowledge.sync', 'seo.audit', 'change.propose'],
  knowledge_reviewer: [
    'connection.read', 'knowledge.read', 'change.read', 'job.read',
    'self.read', 'workspace.read', 'notification.read', 'activity.read',
    'knowledge.sync', 'seo.audit', 'change.propose', 'knowledge.verify',
  ],
  publisher: [
    'connection.read', 'knowledge.read', 'change.read', 'job.read',
    'self.read', 'workspace.read', 'notification.read', 'activity.read',
    'knowledge.sync', 'seo.audit', 'change.propose', 'knowledge.verify',
    'change.authorize', 'change.execute', 'change.restore', 'job.cancel',
  ],
  operations: ['job.read', 'self.read'],
}

export function scopesForRole(role: Role): string[] {
  return LADDER[role] ?? []
}

/** 凭据字符串是否能被测试模拟器解析。 */
export function parseCredential(raw: string): {
  tenant: string
  actor: string
  role: Role
  sites: string[]
} | null {
  const parts = raw.split(':')
  if (parts.length !== 4 && parts.length !== 5) return null
  if (parts[0] !== 'test-cred') return null
  const [prefix, tenant, actor, role, sitesCsv] = parts
  if (prefix !== 'test-cred' || !tenant || !actor) return null
  if (!(ROLES as readonly string[]).includes(role)) return null
  const sites = sitesCsv ? sitesCsv.split(',').map((s) => s.trim()).filter(Boolean) : []
  return { tenant, actor, role: role as Role, sites }
}

export function buildCredential(t: { tenant: string; actor: string; role: Role; sites?: string[] }): string {
  const base = `test-cred:${t.tenant}:${t.actor}:${t.role}`
  const sites = t.sites && t.sites.length > 0 ? `:${t.sites.join(',')}` : ''
  return base + sites
}
