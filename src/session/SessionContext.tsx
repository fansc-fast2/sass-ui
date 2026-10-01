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
  completeOidcLogin: (oit: string) => Promise<Membership[]>
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
  return ['connection.read', 'knowledge.read', 'change.read', 'job.read', 'self.read', 'workspace.read', 'notification.read', 'activity.read', 'knowledge.sync', 'seo.audit', 'change.propose', 'knowledge.verify', 'change.authorize', 'change.execute', 'change.restore', 'job.cancel', 'workspace.admin']
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
        // identity 会话用 memberships 端点验证（此前这里还多发一条 /ops/v1/me：
        // identity 受众调 ops 端点注定 401，纯噪音，已删）。
        const res = await fetch('/v1/me/memberships', { headers: { Authorization: `Bearer ${tok}` } })
        if (!res.ok) throw new Error('session invalid')
        const data = (await res.json()) as { data: { items: Membership[] } }
        setMemberships(data.data.items)
        // 身份资料从会话 claims 恢复（token 自描述）。此前不恢复 identityUser，
        // 飞书回调整页刷新后 gate 判定未认证，永远弹回登录窗——登录链其实
        // 已全部成功，只是内存资料丢了。
        try {
          const pad = (v: string) => v + '='.repeat((4 - (v.length % 4)) % 4)
          const claims = JSON.parse(atob(pad(tok.split('.')[0] ?? '').replace(/-/g, '+').replace(/_/g, '/')))
          // Go sessionClaims 序列化为首字母大写键（Sub/Login）；做大小写兼容
          const sub = claims?.Sub ?? claims?.sub
          const login = claims?.Login ?? claims?.login
          if (sub) {
            const name = typeof login === 'string' && login ? login : sub
            setIdentityUser({ id: sub, login: name, display_name: name })
          }
        } catch { /* claims 不可解析不阻塞：memberships 已证明会话有效 */ }
        // active 租户仍有效？身份资料不持久化——重开页面只恢复租户上下文
        const act = sGet(ACTIVE_KEY)
        if (act) {
          const parsed = JSON.parse(act) as ActiveTenant
          if (data.data.items.some((m) => m.tenant_id === parsed.tenantId)) {
            setActive(parsed)
          } else {
            sSet(ACTIVE_KEY, null)
            sSet(TENANT_TOKEN_KEY, null)
          }
        } else if (data.data.items.length === 1) {
          // 单租户用户自动进入：没有"选租户"的中间步骤，避免再次落回登录门
          const only = data.data.items[0]
          const tcRes = await fetch('/v1/session/tenant-context', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ membership_id: only.membership_id }),
          })
          if (tcRes.ok) {
            const tcData = (await tcRes.json()) as { data: { token: string; tenant_context: { tenant_id: string; role: string } } }
            sSet(TENANT_TOKEN_KEY, tcData.data.token)
            const restored: ActiveTenant = { tenantId: only.tenant_id, tenantName: only.tenant_name, role: tcData.data.tenant_context.role }
            sSet(ACTIVE_KEY, JSON.stringify(restored))
            setActive(restored)
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

  // OIDC 回调完成：一次性码换取身份会话（M0 Q06 生产身份路径）
  const completeOidcLogin = useCallback(async (oit: string): Promise<Membership[]> => {
    const res = await fetch('/v1/auth/oidc/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oit }),
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
      login, completeOidcLogin, selectTenant, logout, hasScope,
    }),
    [identityUser, identityToken, memberships, active, booted, login, completeOidcLogin, selectTenant, logout, hasScope],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession 必须在 SessionProvider 内使用')
  return ctx
}
