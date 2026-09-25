// 会话上下文：持有测试凭据（localStorage 持久化），派生租户上下文与权限范围，
// 并把 token 提供器接到 API 客户端。

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { setTokenProvider } from '../api/client'
import { buildCredential, parseCredential, scopesForRole } from './permissions'
import type { Role } from './permissions'

const STORAGE_KEY = 'platform-web.credential'

export interface Session {
  credential: string
  tenant: string
  actor: string
  role: Role
  sites: string[]
  scopes: string[]
}

interface SessionContextValue {
  session: Session | null
  save: (input: { tenant: string; actor: string; role: Role; sites?: string[] }) => void
  clear: () => void
  hasScope: (perm: string) => boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

function loadFromStorage(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = parseCredential(raw)
    if (!parsed) return null
    return {
      credential: raw,
      tenant: parsed.tenant,
      actor: parsed.actor,
      role: parsed.role,
      sites: parsed.sites,
      scopes: scopesForRole(parsed.role),
    }
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadFromStorage())

  useEffect(() => {
    setTokenProvider(() => session?.credential ?? null)
  }, [session])

  const save = useCallback((input: { tenant: string; actor: string; role: Role; sites?: string[] }) => {
    const credential = buildCredential(input)
    const parsed = parseCredential(credential)
    if (!parsed) return
    const next: Session = {
      credential,
      tenant: parsed.tenant,
      actor: parsed.actor,
      role: parsed.role,
      sites: parsed.sites,
      scopes: scopesForRole(parsed.role),
    }
    try {
      localStorage.setItem(STORAGE_KEY, credential)
    } catch {
      // 隐私模式等场景下持久化失败不阻塞使用
    }
    setSession(next)
  }, [])

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 同上
    }
    setSession(null)
  }, [])

  const hasScope = useCallback(
    (perm: string) => session !== null && session.scopes.includes(perm),
    [session],
  )

  const value = useMemo(
    () => ({ session, save, clear, hasScope }),
    [session, save, clear, hasScope],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession 必须在 SessionProvider 内使用')
  return ctx
}
