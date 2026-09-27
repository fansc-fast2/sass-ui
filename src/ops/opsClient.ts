// 平台运营面（/ops）API 客户端：独立会话（platform_* 角色），
// 与租户业务面（/v1，test-cred 凭据）互不混用。信封形状与 /v1 一致。

const TOKEN_KEY = 'platform-web.ops-token'

export interface OpsTenant {
  id: string
  name: string
  status: 'provisioning' | 'active' | 'suspended' | 'closing' | 'closed'
  plan_id: string
  owner_actor: string
  member_count: number
  created_at: string
  updated_at: string
}

export interface OpsMember {
  tenant_id: string
  actor_id: string
  role: string
  status: string
  joined_at: string
}

export class OpsRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string
  constructor(status: number, code: string, message: string, requestId: string) {
    super(message)
    this.name = 'OpsRequestError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

export function getOpsToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setOpsToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 忽略持久化失败
  }
}

async function opsRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (method === 'POST') headers['Content-Type'] = 'application/json'
  const token = getOpsToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(path, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  })
  const json = await res.json().catch(() => null)
  const env = json as { request_id?: string; data?: T; error?: { code: string; message: string } }
  if (!res.ok) {
    throw new OpsRequestError(
      res.status,
      env?.error?.code ?? 'UNKNOWN',
      env?.error?.message ?? `HTTP ${res.status}`,
      env?.request_id ?? '',
    )
  }
  if (env?.data === undefined) throw new OpsRequestError(res.status, 'BAD_ENVELOPE', '响应缺少 data', env?.request_id ?? '')
  return env.data
}

export const identityLogin = async (login: string, password: string): Promise<{ token: string; identity: { id: string; login: string; display_name: string } }> =>
  (await opsRequest('POST', '/v1/auth/login', { login, password })) as { token: string; identity: { id: string; login: string; display_name: string } }

// v0.2 §3：Identity 会话换 Ops 会话（需平台角色授权，无隐含租户访问）
export const opsExchange = async (identityToken: string): Promise<{ token: string; platform_roles: string[] }> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${identityToken}`,
  }
  const res = await fetch('/ops/v1/session/ops-context', { method: 'POST', headers, body: '{}' })
  const json = await res.json().catch(() => null)
  const env = json as { data?: { token: string; platform_roles: string[] }; error?: { code: string; message: string }; request_id?: string }
  if (!res.ok || !env?.data) {
    throw new OpsRequestError(res.status, env?.error?.code ?? 'UNKNOWN', env?.error?.message ?? `HTTP ${res.status}`, env?.request_id ?? '')
  }
  return env.data
}

export const opsMe = () => opsRequest<{ subject: string; platform_role: string }>('GET', '/ops/v1/me')

export const opsListTenants = (query: { status?: string; q?: string } = {}) =>
  opsRequest<{ items: OpsTenant[]; next_cursor: string | null }>('GET', '/ops/v1/tenants' + qs(query))

export const opsGetTenant = (id: string) => opsRequest<OpsTenant>('GET', `/ops/v1/tenants/${encodeURIComponent(id)}`)

export const opsCreateTenant = (body: { name: string; owner_actor: string; plan_id?: string }) =>
  opsRequest<OpsTenant>('POST', '/ops/v1/tenants', body)

export const opsChangeTenantStatus = (id: string, status: string) =>
  opsRequest<OpsTenant>('POST', `/ops/v1/tenants/${encodeURIComponent(id)}/status`, { status })

export const opsListMembers = (id: string) =>
  opsRequest<{ items: OpsMember[]; next_cursor: string | null }>('GET', `/ops/v1/tenants/${encodeURIComponent(id)}/members`)

// ---- F2 运营分析 ----

export interface UsageRow {
  tenant_id: string
  tenant_name: string
  status: string
  metrics: { metric: string; unit: string; total: number; by_quality: Record<string, number>; event_count: number }[]
  estimated_cost: number
  currency: string
  cost_is_estimate: boolean
}

export interface AuditEntryView {
  id: number
  actor: string
  action: string
  target: string
  reason: string
  at: string
}

export const opsUsageOverview = () =>
  opsRequest<{ rows: UsageRow[]; as_of: string; note: string }>('GET', '/ops/v1/usage')

export const opsCreateUsageExport = (tenantId: string) =>
  opsRequest<{ operation_id: string; status: string; rows: number }>('POST', '/ops/v1/usage-exports', { tenant_id: tenantId || undefined })

export const opsDownloadUsageExport = async (id: string): Promise<string> => {
  const token = getOpsToken()
  const res = await fetch(`/ops/v1/usage-exports/${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new OpsRequestError(res.status, 'DOWNLOAD_FAILED', `HTTP ${res.status}`, '')
  return res.text()
}

export const opsSearchAudit = (query: { actor?: string; action?: string; target?: string } = {}) =>
  opsRequest<{ items: AuditEntryView[]; total_matched: number }>('GET', '/ops/v1/audit' + qs(query))

// ---- 插件管理（渠道安装绑定 / 插件用户 / 计量与参考成本） ----
// 诚实边界：付费情况为计量聚合 + 参考价估算（estimated），非账单；
// 插件用户 = 绑定租户的平台成员；插件业务端内用户平台侧暂不可见。

export interface PluginManifestView {
  plugin_key: string
  plugin_version: string
  supported_channels: string[]
  usage_metrics: string[]
}

export interface PluginsOverview {
  registrations: PluginManifestView[]
  installations: { active: number; uninstalled: number }
  tenants_with_plugin: number
  kernel_installations: number
}

export interface ChannelInstallRow {
  id: string
  tenant_id: string
  shop_stable_id: string
  canonical_shop_domain: string
  registration_id: string
  status: string
  installation_epoch: number
  auth_status: string
  installed_at: string
  uninstalled_at?: string
  tenant?: { id: string; name: string; status: string; plan_id: string }
  members?: { membership_id: string; subject_id: string; role: string; status: string; joined_at: string }[]
  executors?: { executor_id: string; site_id: string; audience: string; status: string; protocol_range: string }[]
  plugin_installations?: { id: string; plugin_key: string; plugin_version: string; status: string; installation_epoch: number; site_id: string }[]
  usage?: { metric: string; unit: string; total: number; by_quality: Record<string, number>; event_count: number; last_at: string }[]
  cost_estimate?: {
    lines: { metric: string; quantity: number; unit: string; unit_price: number; estimated_cost: number; currency: string; price_version: string; estimated: boolean; unknown_qty: number }[]
    estimated_total: number
    currency: string
    note: string
  }
}

export const opsPluginsOverview = () => opsRequest<PluginsOverview>('GET', '/ops/v1/plugins/overview')

export const opsListChannelInstallations = (query: { tenant_id?: string; status?: string; registration_id?: string } = {}) =>
  opsRequest<{ items: ChannelInstallRow[]; count: number }>('GET', '/ops/v1/channel-installations' + qs(query))

export const opsCreateChannelInstallation = (body: {
  tenant_id: string
  shop_stable_id: string
  canonical_shop_domain: string
  channel_app_registration_id: string
}) => opsRequest<ChannelInstallRow>('POST', '/ops/v1/channel-installations', body)

export const opsChannelInstallationDetail = (id: string) =>
  opsRequest<ChannelInstallRow>('GET', `/ops/v1/channel-installations/${encodeURIComponent(id)}`)

// 卸载响应为旧 payload 形状（channel_app_registration_id 键名），UI 卸载后
// 统一刷新列表，因此只声明会用到的字段。
export const opsUninstallChannelInstallation = (body: { channel_app_registration_id: string; shop_stable_id: string }) =>
  opsRequest<{ id: string; status: string; installation_epoch: number }>('POST', '/ops/v1/channel-installations/uninstall', body)

// ---- 支持授权（F1：申请 → 租户审批 → 15 分钟会话 → 撤销） ----

export interface SupportGrantView {
  id: string
  tenant_id: string
  requested_by: string
  approved_by: string
  purpose: string
  ticket: string
  permission: string
  status: string // requested | approved | active | revoked | rejected | expired
  session_expires_at: string | null
  created_at: string
}

export const opsAllSupportGrants = (query: { tenant_id?: string } = {}) =>
  opsRequest<{ items: SupportGrantView[]; count: number }>('GET', '/ops/v1/support-grants' + qs(query))

export const opsRequestSupportGrant = (tenantId: string, body: { purpose: string; ticket: string }) =>
  opsRequest<SupportGrantView>('POST', `/ops/v1/tenants/${encodeURIComponent(tenantId)}/support-grants`, body)

export const opsCreateSupportSession = (grantId: string) =>
  opsRequest<{ support_session: string; expires_at: string; grant: SupportGrantView }>(
    'POST', `/ops/v1/support-grants/${encodeURIComponent(grantId)}/sessions`)

export const opsRevokeSupportGrant = (grantId: string) =>
  opsRequest<{ id: string; status: string }>('POST', `/ops/v1/support-grants/${encodeURIComponent(grantId)}/revoke`)

function qs(query: Record<string, string | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `?${s}` : ''
}
