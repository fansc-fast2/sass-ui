// 租户注册表：本机保存的租户清单（第一核心是租户管理）。
// 后端身份控制面未接入（M0 Q06 测试模拟器，任意 test-cred 租户即可接入），
// 因此注册表先由前端 localStorage 维护；Q06 落地后本模块可平移替换为真实 API。

import { useCallback, useState } from 'react'
import { buildCredential, parseCredential } from '../session/permissions'
import type { Role } from '../session/permissions'

const STORAGE_KEY = 'platform-web.tenants'

export interface TenantEntry {
  tenant: string
  actor: string
  role: Role
  sites: string[]
  lastUsedAt: number
}

export function loadTenants(): TenantEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const list: TenantEntry[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      if (typeof rec.tenant !== 'string' || typeof rec.actor !== 'string'
        || typeof rec.role !== 'string' || typeof rec.lastUsedAt !== 'number') continue
      const cred = buildCredential({
        tenant: rec.tenant,
        actor: rec.actor,
        role: rec.role as Role,
        sites: Array.isArray(rec.sites) ? rec.sites.filter((s): s is string => typeof s === 'string') : [],
      })
      const valid = parseCredential(cred)
      if (!valid) continue
      list.push({
        tenant: rec.tenant,
        actor: rec.actor,
        role: valid.role,
        sites: valid.sites,
        lastUsedAt: rec.lastUsedAt,
      })
    }
    return list.sort((a, b) => b.lastUsedAt - a.lastUsedAt)
  } catch {
    return []
  }
}

function persist(list: TenantEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隐私模式等场景下持久化失败不阻塞使用
  }
}

export function upsertTenant(list: TenantEntry[], entry: {
  tenant: string
  actor: string
  role: Role
  sites?: string[]
}): TenantEntry[] {
  const next = [
    { tenant: entry.tenant, actor: entry.actor, role: entry.role, sites: entry.sites ?? [], lastUsedAt: Date.now() },
    ...list.filter((t) => t.tenant !== entry.tenant),
  ]
  persist(next)
  return next
}

export function removeTenant(list: TenantEntry[], tenant: string): TenantEntry[] {
  const next = list.filter((t) => t.tenant !== tenant)
  persist(next)
  return next
}

/** React 绑定：注册表状态 + 增删改（自动持久化）。 */
export function useTenantRegistry() {
  const [tenants, setTenants] = useState<TenantEntry[]>(() => loadTenants())
  const upsert = useCallback((entry: Parameters<typeof upsertTenant>[1]) => {
    setTenants((prev) => upsertTenant(prev, entry))
  }, [])
  const remove = useCallback((tenant: string) => {
    setTenants((prev) => removeTenant(prev, tenant))
  }, [])
  return { tenants, upsert, remove }
}
