// 会话上下文（v0.2 §3 三上下文）：
//   Identity 会话（登录）→ memberships（权威目录）→ 选择成员关系 →
//   TenantContext 会话（aud=tenant，业务 API 凭据）。
// 凭据只存 sessionStorage（v0.2 §3.2：localStorage 仅允许最后选中 ID/偏好）；
// 切换租户 = 重新交换；重开页面回服务端验证。

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setTokenProvider } from '../api/client'

const ID_TOKEN_KEY = 'platform-web.identity-token'
const TENANT_TOKEN_KEY = 'platform-web.tenant-token'
const ACTIVE_KEY = 'platform-web.active-membership'

export interface IdentityUser {
  id: string
  login: string
  display_name: string
}

export interface Membership {
  membership_id: string
  tenant_id: string
  tenant_name: string
  plan_id: string
  role: string
  status: string
  joined_at: string
}

export interface ActiveTenant {
  tenantId: string
  tenantName: string
  role: string
}

interface SessionContextValue {
  identityUser: IdentityUser | null
  identityToken: string | null
  memberships: Membership[]
  active: ActiveTenant | null
  booted: boolean
  login: (login: string, password: string) => Promise<Membership[]>
  selectTenant: (membershipId: string) => Promise<void>
  logout: () => void
  hasScope: (perm: string) => boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

// 客户端镜像 09 §1 角色阶梯（仅用于按钮可用性预判；服务端权威）
const LADDER: Record<string, string[]> = {
  viewer: ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read'],
  analyst: ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read', 'knowledge.sync', 'seo.audit', 'change.propose'],
  knowledge_reviewer: ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read', 'knowledge.sync', 'seo.audit', 'change.propose', 'knowledge.verify'],
  publisher: ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read', 'knowledge.sync', 'seo.audit', 'change.propose', 'knowledge.verify', 'change.authorize', 'change.execute', 'change.restore', 'job.cancel'],
  operations: ['job.read', 'self.read'],
  tenant_admin: LADDER_PUBLISHER(),
}

function LADDER_PUBLISHER(): string[] {
  return ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read', 'knowledge.sync', 'seo.audit', 'change.propose', 'knowledge.verify', 'change.authorize', 'change.execute', 'change.restore', 'job.cancel']
}

function sGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function sSet(key: string, value: string | null): void {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // 忽略持久化失败
  }
}

async function parseEnvelope<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message: string } } | null
  if (!res.ok || !json || json.data === undefined) {
    throw new Error(json?.error?.message ?? `HTTP ${res.status}`)
  }
  return json.data
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [identityToken, setIdentityToken] = useState<string | null>(() => sGet(ID_TOKEN_KEY))
  const [identityUser, setIdentityUser] = useState<IdentityUser | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [active, setActive] = useState<ActiveTenant | null>(() => {
    try {
      const raw = sessionStorage.getItem(ACTIVE_KEY)
      return raw ? (JSON.parse(raw) as ActiveTenant) : null
    } catch {
      return null
    }
  })
  const [booted, setBooted] = useState(false)

  // 业务 API 凭据 = TenantContext 会话
  useEffect(() => {
    setTokenProvider(() => sGet(TENANT_TOKEN_KEY))
  }, [])

  // 恢复：identity 会话有效则重拉 memberships（权威目录）；凭据/成员关系失效则清空
  useEffect(() => {
    void (async () => {
      const tok = sGet(ID_TOKEN_KEY)
      if (!tok) {
        setBooted(true)
        return
      }
      try {
        const me = await fetch('/ops/v1/me', { headers: { Authorization: `Bearer ${tok}` } }).catch(() => null)
        // /ops/v1/me 是 ops 上下文；identity 会话用 memberships 端点验证即可
        void me
        const res = await fetch('/v1/me/memberships', { headers: { Authorization: `Bearer ${tok}` } })
        if (!res.ok) throw new Error('session invalid')
        const data = (await res.json()) as { data: { items: Membership[] } }
        setMemberships(data.data.items)
        // active 租户仍有效？
        const act = sGet(ACTIVE_KEY)
        if (act) {
          const parsed = JSON.parse(act) as ActiveTenant
          if (data.data.items.some((m) => m.tenant_id === parsed.tenantId)) {
            setIdentityUser({ id: parsed.tenantId, login: '', display_name: parsed.role })
            setIdentityToken(tok)
            setActive(parsed)
          } else {
            sSet(ACTIVE_KEY, null)
            sSet(TENANT_TOKEN_KEY, null)
          }
        }
        setIdentityToken(tok)
      } catch {
        sSet(ID_TOKEN_KEY, null)
        sSet(TENANT_TOKEN_KEY, null)
        sSet(ACTIVE_KEY, null)
        setIdentityToken(null)
      }
      setBooted(true)
    })()
  }, [])

  const login = useCallback(async (login: string, password: string): Promise<Membership[]> => {
    const res = await fetch('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    })
    const data = await parseEnvelope<{ token: string; identity: IdentityUser }>(res)
    sSet(ID_TOKEN_KEY, data.token)
    setIdentityToken(data.token)
    setIdentityUser(data.identity)
    const memRes = await fetch('/v1/me/memberships', { headers: { Authorization: `Bearer ${data.token}` } })
    const memData = await parseEnvelope<{ items: Membership[] }>(memRes)
    setMemberships(memData.items)
    return memData.items
  }, [])

  const selectTenant = useCallback(async (membershipId: string): Promise<void> => {
    const tok = sGet(ID_TOKEN_KEY)
    if (!tok) throw new Error('no identity session')
    const res = await fetch('/v1/session/tenant-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ membership_id: membershipId }),
    })
    const data = await parseEnvelope<{ token: string; tenant_context: { tenant_id: string; role: string } }>(res)
    const m = memberships.find((x) => x.membership_id === membershipId)
    const act: ActiveTenant = {
      tenantId: data.tenant_context.tenant_id,
      tenantName: m?.tenant_name ?? data.tenant_context.tenant_id,
      role: data.tenant_context.role,
    }
    sSet(TENANT_TOKEN_KEY, data.token)
    sSet(ACTIVE_KEY, JSON.stringify(act))
    setActive(act)
  }, [memberships])

  const logout = useCallback(() => {
    sSet(ID_TOKEN_KEY, null)
    sSet(TENANT_TOKEN_KEY, null)
    sSet(ACTIVE_KEY, null)
    setIdentityToken(null)
    setIdentityUser(null)
    setMemberships([])
    setActive(null)
  }, [])

  const scopes = active ? LADDER[active.role] ?? [] : []
  const hasScope = useCallback((perm: string) => scopes.includes(perm), [scopes])

  const value = useMemo(
    () => ({
      identityUser, identityToken, memberships, active, booted,
      login, selectTenant, logout, hasScope,
    }),
    [identityUser, identityToken, memberships, active, booted, login, selectTenant, logout, hasScope],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession 必须在 SessionProvider 内使用')
  return ctx
}
