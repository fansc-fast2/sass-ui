// 应用级共享状态：导航、健康、操作日志与工作对象（任务/变更集/执行）。
// 每条记录自动打上当前租户标记（第一核心：租户管理与租户数据隔离），
// 页面消费的是当前租户的过滤视图，切换租户后互不可见。

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  AuthorizationCreated,
  ChangeSetCreated,
} from '../api/types'
import { useSession } from '../session/SessionContext'

// v1.5 导航路由（19 §3 / contracts/navigation.json）：六入口 + 设置。
// 详情页（商品/站点/任务）通过 navigate(page, focusId) 传递对象 ID。
export type PageKey =
  | 'overview'
  | 'ai'
  | 'products'
  | 'product-detail'
  | 'evidence'
  | 'sites'
  | 'site-detail'
  | 'optimization'
  | 'tasks'
  | 'task-detail'
  | 'settings'

export interface HealthState {
  ok: boolean
  ms: number
  checkedAt: number
}

export interface OpLogEntry {
  id: number
  tenant: string
  time: string
  method: string
  path: string
  status: number | 'ERR'
  code?: string
  elapsedMs: number
  requestId?: string
}

export interface JobRecord {
  tenant: string
  jobId: string
  kind: 'sync' | 'audit' | 'cancel'
  createdAt: string
  lastStatus?: string
}

export interface ChangeSetRecord {
  tenant: string
  id: string
  status?: string
  contentHash?: string
  proposalVersion?: number
  itemCount?: number
  authorizationId?: string
  grantType?: string
  createdAt: string
}

export interface ExecutionRecord {
  tenant: string
  executionId: string
  jobId?: string
  status?: string
  createdAt: string
}

interface AppStateContextValue {
  // 导航
  page: PageKey
  navigate: (page: PageKey, focusId?: string) => void
  focusId: string | null
  clearFocusId: () => void
  // 健康
  health: HealthState | null
  setHealth: (h: HealthState) => void
  // 当前租户与租户隔离视图
  currentTenant: string
  tenantOpLog: OpLogEntry[]
  tenantJobs: JobRecord[]
  tenantChangeSets: ChangeSetRecord[]
  tenantExecutions: ExecutionRecord[]
  // 全量原始记录（设置页按租户聚合用）
  opLog: OpLogEntry[]
  logOp: (entry: Omit<OpLogEntry, 'id' | 'time' | 'tenant'>) => void
  clearOpLog: () => void
  jobs: JobRecord[]
  addJob: (job: Omit<JobRecord, 'tenant'>) => void
  updateJobStatus: (jobId: string, status: string) => void
  changeSets: ChangeSetRecord[]
  upsertChangeSet: (set: Partial<ChangeSetCreated> & { id: string }) => void
  attachAuthorization: (setId: string, auth: AuthorizationCreated) => void
  executions: ExecutionRecord[]
  addExecution: (exec: { executionId: string; jobId?: string; status?: string }) => void
  updateExecutionStatus: (executionId: string, status: string) => void
}

const AppStateContext = createContext<AppStateContextValue | null>(null)

let opSeq = 1

export function AppStateProvider({ children }: { children: ReactNode }) {
  // SessionProvider 是本 Provider 的祖先，可以直接消费当前会话（租户上下文）。
  const { session } = useSession()
  const tenant = session?.tenant ?? ''

  // v1.6 22 §2：默认落地首个可访问的已实现业务页（商品与知识），工作台为 M2b 增强。
  const [page, setPage] = useState<PageKey>('products')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthState | null>(null)
  const [opLog, setOpLog] = useState<OpLogEntry[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [changeSets, setChangeSets] = useState<ChangeSetRecord[]>([])
  const [executions, setExecutions] = useState<ExecutionRecord[]>([])

  const navigate = useCallback((next: PageKey, id?: string) => {
    if (id !== undefined) setFocusId(id)
    setPage(next)
  }, [])

  const clearFocusId = useCallback(() => setFocusId(null), [])

  const logOp = useCallback((entry: Omit<OpLogEntry, 'id' | 'time' | 'tenant'>) => {
    setOpLog((prev) => [
      {
        ...entry,
        tenant,
        id: opSeq++,
        time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      },
      ...prev,
    ].slice(0, 100))
  }, [tenant])

  const clearOpLog = useCallback(() => setOpLog([]), [])

  const addJob = useCallback((job: Omit<JobRecord, 'tenant'>) => {
    setJobs((prev) => (prev.some((j) => j.tenant === tenant && j.jobId === job.jobId)
      ? prev
      : [{ ...job, tenant }, ...prev]))
  }, [tenant])

  const updateJobStatus = useCallback((jobId: string, status: string) => {
    setJobs((prev) => prev.map((j) => (j.jobId === jobId ? { ...j, lastStatus: status } : j)))
  }, [])

  const upsertChangeSet = useCallback((set: Partial<ChangeSetCreated> & { id: string }) => {
    setChangeSets((prev) => {
      const existing = prev.find((c) => c.id === set.id)
      const merged: ChangeSetRecord = {
        id: set.id,
        tenant: existing?.tenant ?? tenant,
        status: set.status ?? existing?.status,
        contentHash: set.content_hash ?? existing?.contentHash,
        proposalVersion: set.proposal_version ?? existing?.proposalVersion,
        itemCount: set.item_count ?? existing?.itemCount,
        authorizationId: existing?.authorizationId,
        grantType: existing?.grantType,
        createdAt: existing?.createdAt ?? new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      }
      return existing ? prev.map((c) => (c.id === set.id ? merged : c)) : [merged, ...prev]
    })
  }, [tenant])

  const attachAuthorization = useCallback((setId: string, auth: AuthorizationCreated) => {
    setChangeSets((prev) =>
      prev.map((c) =>
        c.id === setId
          ? { ...c, authorizationId: auth.authorization_id, grantType: auth.grant_type, status: 'authorized' }
          : c,
      ),
    )
  }, [])

  const addExecution = useCallback((exec: { executionId: string; jobId?: string; status?: string }) => {
    setExecutions((prev) =>
      prev.some((e) => e.tenant === tenant && e.executionId === exec.executionId)
        ? prev
        : [
            {
              tenant,
              executionId: exec.executionId,
              jobId: exec.jobId,
              status: exec.status,
              createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
            },
            ...prev,
          ],
    )
  }, [tenant])

  const updateExecutionStatus = useCallback((executionId: string, status: string) => {
    setExecutions((prev) =>
      prev.map((e) => (e.executionId === executionId ? { ...e, status } : e)),
    )
  }, [])

  // 租户隔离视图：页面只看到当前租户的记录
  const tenantOpLog = useMemo(() => opLog.filter((e) => e.tenant === tenant), [opLog, tenant])
  const tenantJobs = useMemo(() => jobs.filter((j) => j.tenant === tenant), [jobs, tenant])
  const tenantChangeSets = useMemo(() => changeSets.filter((c) => c.tenant === tenant), [changeSets, tenant])
  const tenantExecutions = useMemo(() => executions.filter((e) => e.tenant === tenant), [executions, tenant])

  const value = useMemo(
    () => ({
      page, navigate, focusId, clearFocusId,
      health, setHealth,
      currentTenant: tenant,
      tenantOpLog, tenantJobs, tenantChangeSets, tenantExecutions,
      opLog, logOp, clearOpLog,
      jobs, addJob, updateJobStatus,
      changeSets, upsertChangeSet, attachAuthorization,
      executions, addExecution, updateExecutionStatus,
    }),
    [page, navigate, focusId, clearFocusId, health, tenant,
      tenantOpLog, tenantJobs, tenantChangeSets, tenantExecutions,
      opLog, logOp, clearOpLog, jobs, addJob, updateJobStatus,
      changeSets, upsertChangeSet, attachAuthorization, executions, addExecution, updateExecutionStatus],
  )
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState 必须在 AppStateProvider 内使用')
  return ctx
}
