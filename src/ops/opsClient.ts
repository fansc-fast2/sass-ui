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

function qs(query: Record<string, string | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `?${s}` : ''
}
