// 执行记录：任务与执行两大块——查状态、轮询、请求取消、失败项生成恢复提案。
// 任务从「商品知识」发起后在这里跟踪；恢复提案会生成新的草稿，回到「优化提案」继续。
// 列表只展示当前租户的记录（租户隔离视图）。

import { useEffect, useRef, useState } from 'react'
import { cancelJob, createRestoreProposals, getExecution, getJob } from '../api/api'
import { idempotencyScopeFor } from '../api/idempotency'
import type { ExecutionView, JobDetail } from '../api/types'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'
import { toast } from '../components/Toast'
import { JobStatusBadge, StatusBadge } from '../components/StatusBadge'
import {
  Badge, Button, Card, ErrorBanner, Field, MonoText, ResultRow, TextArea, TextInput,
} from '../components/ui'
import { IconArrowRight } from '../components/icons'

export function ActivityPanels() {
  const { hasScope } = useSession()
  const { tenantJobs, updateJobStatus, tenantExecutions, upsertChangeSet, navigate } = useAppState()
  const { loading, error, run } = useApiOperation()

  // 任务查询/轮询
  const [lookupId, setLookupId] = useState('')
  const [polled, setPolled] = useState<JobDetail | null>(null)
  const [polling, setPolling] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('误提交')
  const [cancelResult, setCancelResult] = useState<string | null>(null)
  const pollTimer = useRef<number | null>(null)

  // 执行详情 / 恢复提案
  const [execId, setExecId] = useState('')
  const [execView, setExecView] = useState<ExecutionView | null>(null)
  const [itemIdsRaw, setItemIdsRaw] = useState('')
  const [restoreReason, setRestoreReason] = useState('部分项失败，需恢复重做')
  const [restoreResult, setRestoreResult] = useState<string | null>(null)

  useEffect(() => () => {
    if (pollTimer.current !== null) window.clearInterval(pollTimer.current)
  }, [])

  const canRead = hasScope('job.read')
  const canCancel = hasScope('job.cancel')
  const canRestore = hasScope('change.restore')

  const lookup = async (id: string) => {
    if (!id.trim()) return
    const res = await run('GET', `/v1/jobs/${id.trim()}`, () => getJob(id.trim()))
    if (res) {
      setPolled(res.data)
      updateJobStatus(res.data.id, res.data.status)
    }
  }

  const startPolling = (id: string) => {
    stopPolling()
    setPolling(id)
    void lookup(id)
    pollTimer.current = window.setInterval(() => void lookup(id), 2000)
  }

  const stopPolling = () => {
    if (pollTimer.current !== null) {
      window.clearInterval(pollTimer.current)
      pollTimer.current = null
    }
    setPolling(null)
  }

  const submitCancel = async () => {
    const target = (polled?.id ?? lookupId).trim()
    if (!target) return
    const res = await run('POST', `/v1/jobs/${target}/cancel`, () =>
      cancelJob(target, { reason: cancelReason }))
    if (res) {
      setCancelResult(`${res.data.job_id}：当前状态 ${res.data.status}（取消是请求，不保证立即生效）`)
      updateJobStatus(res.data.job_id, res.data.status)
      toast.info(`取消请求已受理（${res.data.status}）：取消是请求，不保证立即生效`)
    }
  }

  const queryExecution = async (id?: string) => {
    const target = (id ?? execId).trim()
    if (!target) return
    const res = await run('GET', `/v1/executions/${target}`, () => getExecution(target))
    if (res) {
      setExecView(res.data)
      setExecId(res.data.id)
    }
  }

  const submitRestore = async () => {
    const target = execId.trim()
    if (!target) return
    const ids = itemIdsRaw.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      setRestoreResult('至少填写一个执行项 ID')
      return
    }
    const res = await run('POST', `/v1/executions/${target}/restore-proposals`, () =>
      createRestoreProposals(target, { execution_item_ids: ids, reason: restoreReason, baseline: 'published_baseline' }, {
        // 10 §5：恢复请求用稳定幂等键（同执行 + 同失败项 + 同理由重试不产生重复提案）
        idempotencyScope: idempotencyScopeFor('exec-restore', target, { ids, reason: restoreReason }),
      }))
    if (res) {
      upsertChangeSet({ id: res.data.change_set_id, status: res.data.status })
      setRestoreResult(`已生成恢复提案 ${res.data.change_set_id}（${res.data.status}）`)
      toast.ok(`恢复提案已生成：${res.data.change_set_id}（${res.data.status}）`)
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />

      <Card
        title="任务"
        subtitle="从「商品知识」发起的同步/审计任务在这里查状态；每 2 秒轮询一次"
      >
        <div className="row gap">
          <TextInput
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="任务编号 job_id"
            style={{ maxWidth: 360 }}
            onKeyDown={(e) => e.key === 'Enter' && canRead && void lookup(lookupId)}
          />
          <Button disabled={!canRead || loading || !lookupId.trim()} onClick={() => void lookup(lookupId)}>查询</Button>
          {polling === lookupId ? (
            <Button variant="ghost" onClick={stopPolling}>停止轮询</Button>
          ) : (
            <Button disabled={!canRead || !lookupId.trim()} onClick={() => startPolling(lookupId)}>自动轮询</Button>
          )}
        </div>
        {polled && (
          <div className="result-col">
            <ResultRow label="任务编号"><MonoText>{polled.id}</MonoText></ResultRow>
            <ResultRow label="状态"><JobStatusBadge status={polled.status} /></ResultRow>
            {/* v1.6 F02：result 按任务类型聚合，不同类型互不混用 */}
            {polled.result && (
              <ResultRow label="分项聚合">
                <span className="muted">
                  成功 {polled.result.successful_items} · 失败 {polled.result.failed_items} ·
                  {' '}取消 {polled.result.cancelled_items} · 跳过 {polled.result.skipped_items}
                  {polled.result.kind === 'audit' && polled.result.issues_found !== null ? ` · 发现问题 ${polled.result.issues_found}` : ''}
                  {' '}（口径 {polled.result.kind} · basis {polled.result.basis_revision}
                  {polled.result.completion_reason ? ` · 完成原因 ${polled.result.completion_reason}` : ''}）
                </span>
              </ResultRow>
            )}
            {/* v1.6 F09：恢复始终生成新提案；原终态历史不原位重跑 */}
            <ResultRow label="恢复方式">
              <span className="muted">
                {polled.retry_of ? `本任务是 ${polled.retry_of} 的重试。` : ''}失败项通过「失败项恢复」生成新提案，原任务历史保留。
              </span>
            </ResultRow>
          </div>
        )}

        {tenantJobs.length > 0 && (
          <table className="table">
            <thead><tr><th>任务编号</th><th>类型</th><th>发起时间</th><th>最近状态</th><th></th></tr></thead>
            <tbody>
              {tenantJobs.map((j) => (
                <tr key={j.jobId}>
                  <td><MonoText>{j.jobId}</MonoText></td>
                  <td>{j.kind === 'sync' ? '同步' : j.kind === 'audit' ? '审计' : '取消'}</td>
                  <td>{j.createdAt}</td>
                  <td>{j.lastStatus ? <JobStatusBadge status={j.lastStatus} /> : '—'}</td>
                  <td><Button className="btn-xs" onClick={() => { setLookupId(j.jobId); void lookup(j.jobId) }}>查询</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="cancel-row">
          <TextInput value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={{ maxWidth: 280 }} />
          <Button
            variant="danger"
            disabled={!canCancel || loading || (!polled && !lookupId.trim())}
            onClick={() => void submitCancel()}
          >
            取消当前查询的任务
          </Button>
          {!canCancel && <span className="muted">取消需要 publisher 角色。</span>}
        </div>
        {cancelResult && <p><Badge tone="warn">已受理</Badge> <MonoText>{cancelResult}</MonoText></p>}
      </Card>

      <Card
        title="执行"
        subtitle="提案执行是异步的；失败的部分可以只对失败项生成恢复提案"
      >
        <div className="row gap">
          <TextInput
            value={execId}
            onChange={(e) => setExecId(e.target.value)}
            placeholder="执行编号 execution_id"
            style={{ maxWidth: 360 }}
            onKeyDown={(e) => e.key === 'Enter' && canRead && void queryExecution()}
          />
          <Button variant="primary" disabled={!canRead || loading || !execId.trim()} onClick={() => void queryExecution()}>
            查询详情
          </Button>
        </div>
        {execView && (
          <>
            <ResultRow label="执行项"><Badge tone="neutral">{execView.items.length} 条</Badge></ResultRow>
            {execView.items.length > 0 && (
              <table className="table">
                <thead><tr><th>检查</th><th>层</th><th>状态</th><th>必须</th><th>版本</th><th>证据</th></tr></thead>
                <tbody>
                  {execView.items.map((raw, i) => {
                    // v1.8：PublicationCheck 必返 required/check_version/evidence_ref
                    const it = raw as Record<string, unknown>
                    const status = String(it.status ?? '')
                    return (
                      <tr key={i}>
                        <td><MonoText>{String(it.id ?? '—')}</MonoText></td>
                        <td>{String(it.layer ?? '—')}</td>
                        <td>
                          <StatusBadge status={status} fallbackLabel={status || '—'} />
                        </td>
                        <td>{it.required ? '必须' : '可选'}</td>
                        <td className="muted">{String(it.check_version ?? '—')}</td>
                        <td className="muted">{it.evidence_ref ? <MonoText>{String(it.evidence_ref)}</MonoText> : it.status === 'passed' ? '缺失！' : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {tenantExecutions.length > 0 && (
          <table className="table">
            <thead><tr><th>执行编号</th><th>任务编号</th><th>状态</th><th>发起时间</th><th></th></tr></thead>
            <tbody>
              {tenantExecutions.map((e) => (
                <tr key={e.executionId}>
                  <td><MonoText>{e.executionId}</MonoText></td>
                  <td><MonoText>{e.jobId ?? '—'}</MonoText></td>
                  <td>{e.status ? <StatusBadge status={e.status} fallbackLabel={e.status} /> : '—'}</td>
                  <td>{e.createdAt}</td>
                  <td><Button className="btn-xs" onClick={() => { setExecId(e.executionId); void queryExecution(e.executionId) }}>详情</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="restore-block">
          <strong>失败项恢复</strong>
          <p className="muted">
            v1.8：恢复基线固定为「已发布基线」（published_baseline），恢复产物是新提案而非直接写入，需重新授权；
            原任务终态历史保留。
          </p>
          <div className="grid-2">
            <Field label="执行项 ID" hint="每行一个，或逗号分隔">
              <TextArea rows={3} value={itemIdsRaw} onChange={(e) => setItemIdsRaw(e.target.value)} placeholder={'item-001\nitem-002'} />
            </Field>
            <Field label="恢复理由">
              <TextArea rows={3} value={restoreReason} onChange={(e) => setRestoreReason(e.target.value)} />
            </Field>
          </div>
          <Button variant="primary" disabled={!canRestore || loading || !execId.trim()} onClick={() => void submitRestore()}>
            生成恢复提案
          </Button>
          {!canRestore && <p className="muted">恢复需要 publisher 角色。</p>}
          {restoreResult && (
            <div className="row gap">
              <span><Badge tone="ok">完成</Badge> <MonoText>{restoreResult}</MonoText></span>
              <Button variant="ghost" onClick={() => navigate('optimization')}>
                <span className="btn-icon-text">去优化提案继续流程 <IconArrowRight size={13} /></span>
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
