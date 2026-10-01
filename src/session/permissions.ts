// 客户端镜像 internal/identity/simulator.go 的角色阶梯（09_security §1 权限矩阵），
// 仅用于 UI 预判按钮可用性；服务端始终是权威，403 以接口返回为准。
// 凭据格式：test-cred:<租户>:<用户>:<角色>[:<站点 csv>]
// 角色/权限的展示文案来自 i18n 字典（双语），这里只做 key 映射。

import type { MsgKey, TFunc } from '../i18n'

export const ROLES = ['viewer', 'analyst', 'knowledge_reviewer', 'publisher', 'operations'] as const
export type Role = (typeof ROLES)[number]

const ROLE_KEYS: Record<Role, MsgKey> = {
  viewer: 'roleViewer',
  analyst: 'roleAnalyst',
  knowledge_reviewer: 'roleKnowledgeReviewer',
  publisher: 'rolePublisher',
  operations: 'roleOperations',
}

/** 角色双语标签；未知角色原样返回（如 tenant_admin）。 */
export function roleLabel(t: TFunc, role: string): string {
  const key = ROLE_KEYS[role as Role]
  return key ? t(key) : role
}

const PERM_KEYS: Record<string, MsgKey> = {
  'connection.read': 'permConnectionRead',
  'knowledge.read': 'permKnowledgeRead',
  'knowledge.sync': 'permKnowledgeSync',
  'knowledge.verify': 'permKnowledgeVerify',
  'seo.audit': 'permSeoAudit',
  'change.read': 'permChangeRead',
  'change.propose': 'permChangePropose',
  'change.authorize': 'permChangeAuthorize',
  'change.execute': 'permChangeExecute',
  'change.restore': 'permChangeRestore',
  'job.read': 'permJobRead',
  'job.cancel': 'permJobCancel',
  'self.read': 'permSelfRead',
  'workspace.read': 'permWorkspaceRead',
  'notification.read': 'permNotificationRead',
  'activity.read': 'permActivityRead',
}

/** 权限双语标签；未映射的权限返回空串（调用方自行回退原始权限名）。 */
export function permLabel(t: TFunc, perm: string): string {
  const key = PERM_KEYS[perm]
  return key ? t(key) : ''
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
