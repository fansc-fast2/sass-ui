// 执行记录：任务与执行两大块——查状态、轮询、请求取消、失败项生成恢复提案。
// 任务从「商品知识」发起后在这里跟踪；恢复提案会生成新的草稿，回到「优化提案」继续。
// 列表只展示当前租户的记录（租户隔离视图）。

import { useEffect, useRef, useState } from 'react'
import { cancelJob, createRestoreProposals, getExecution, getJob } from '../api/api'
import { idempotencyScopeFor } from '../api/idempotency'
import type { ExecutionView, JobDetail } from '../api/types'
import { useLang } from '../i18n'
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
  const { t } = useLang()
  const { hasScope } = useSession()
  const { tenantJobs, updateJobStatus, tenantExecutions, upsertChangeSet, navigate } = useAppState()
  const { loading, error, run } = useApiOperation()

  // 任务查询/轮询
  const [lookupId, setLookupId] = useState('')
  const [polled, setPolled] = useState<JobDetail | null>(null)
  const [polling, setPolling] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState(() => t('defaultCancelReason'))
  const [cancelResult, setCancelResult] = useState<string | null>(null)
  const pollTimer = useRef<number | null>(null)

  // 执行详情 / 恢复提案
  const [execId, setExecId] = useState('')
  const [execView, setExecView] = useState<ExecutionView | null>(null)
  const [itemIdsRaw, setItemIdsRaw] = useState('')
  const [restoreReason, setRestoreReason] = useState(() => t('defaultRestoreReason'))
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
      setCancelResult(t('cancelResultMsg', { id: res.data.job_id, status: res.data.status }))
      updateJobStatus(res.data.job_id, res.data.status)
      toast.info(t('cancelAcceptedToast', { status: res.data.status }))
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
      setRestoreResult(t('needOneItemId'))
      return
    }
    const res = await run('POST', `/v1/executions/${target}/restore-proposals`, () =>
      createRestoreProposals(target, { execution_item_ids: ids, reason: restoreReason, baseline: 'published_baseline' }, {
        // 10 §5：恢复请求用稳定幂等键（同执行 + 同失败项 + 同理由重试不产生重复提案）
        idempotencyScope: idempotencyScopeFor('exec-restore', target, { ids, reason: restoreReason }),
      }))
    if (res) {
      upsertChangeSet({ id: res.data.change_set_id, status: res.data.status })
      setRestoreResult(t('restoreResultMsg', { id: res.data.change_set_id, status: res.data.status }))
      toast.ok(t('restoreOkToast', { id: res.data.change_set_id, status: res.data.status }))
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />

      <Card
        title={t('activityJobsTitle')}
        subtitle={t('activityJobsSub')}
      >
        <div className="row gap">
          <TextInput
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder={t('phJobId')}
            style={{ maxWidth: 360 }}
            onKeyDown={(e) => e.key === 'Enter' && canRead && void lookup(lookupId)}
          />
          <Button disabled={!canRead || loading || !lookupId.trim()} onClick={() => void lookup(lookupId)}>{t('query')}</Button>
          {polling === lookupId ? (
            <Button variant="ghost" onClick={stopPolling}>{t('btnStopPolling')}</Button>
          ) : (
            <Button disabled={!canRead || !lookupId.trim()} onClick={() => startPolling(lookupId)}>{t('btnAutoPolling')}</Button>
          )}
        </div>
        {polled && (
          <div className="result-col">
            <ResultRow label={t('labelJobId')}><MonoText>{polled.id}</MonoText></ResultRow>
            <ResultRow label={t('status')}><JobStatusBadge status={polled.status} /></ResultRow>
            {/* v1.6 F02：result 按任务类型聚合，不同类型互不混用 */}
            {polled.result && (
              <ResultRow label={t('labelItemAgg')}>
                <span className="muted">
                  {t('aggLine', { ok: polled.result.successful_items, fail: polled.result.failed_items, cancelled: polled.result.cancelled_items, skipped: polled.result.skipped_items })}
                  {polled.result.kind === 'audit' && polled.result.issues_found !== null ? ` · ${t('issuesFound', { count: polled.result.issues_found })}` : ''}
                  {' '}
                  {polled.result.completion_reason
                    ? t('aggMetaWithReason', { kind: polled.result.kind, rev: polled.result.basis_revision, reason: polled.result.completion_reason })
                    : t('aggMeta', { kind: polled.result.kind, rev: polled.result.basis_revision })}
                </span>
              </ResultRow>
            )}
            {/* v1.6 F09：恢复始终生成新提案；原终态历史不原位重跑 */}
            <ResultRow label={t('labelRecovery')}>
              <span className="muted">
                {polled.retry_of ? t('retryOf', { id: polled.retry_of }) : ''}{t('recoveryHint')}
              </span>
            </ResultRow>
          </div>
        )}

        {tenantJobs.length > 0 && (
          <table className="table">
            <thead><tr><th>{t('labelJobId')}</th><th>{t('type')}</th><th>{t('thStartedAt')}</th><th>{t('thLastStatus')}</th><th></th></tr></thead>
            <tbody>
              {tenantJobs.map((j) => (
                <tr key={j.jobId}>
                  <td><MonoText>{j.jobId}</MonoText></td>
                  <td>{j.kind === 'sync' ? t('jobKindSync') : j.kind === 'audit' ? t('jobKindAudit') : t('jobKindCancel')}</td>
                  <td>{j.createdAt}</td>
                  <td>{j.lastStatus ? <JobStatusBadge status={j.lastStatus} /> : '—'}</td>
                  <td><Button className="btn-xs" onClick={() => { setLookupId(j.jobId); void lookup(j.jobId) }}>{t('query')}</Button></td>
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
            {t('btnCancelQueried')}
          </Button>
          {!canCancel && <span className="muted">{t('cancelPermHint')}</span>}
        </div>
        {cancelResult && <p><Badge tone="warn">{t('accepted')}</Badge> <MonoText>{cancelResult}</MonoText></p>}
      </Card>

      <Card
        title={t('activityExecTitle')}
        subtitle={t('activityExecSub')}
      >
        <div className="row gap">
          <TextInput
            value={execId}
            onChange={(e) => setExecId(e.target.value)}
            placeholder={t('phExecId')}
            style={{ maxWidth: 360 }}
            onKeyDown={(e) => e.key === 'Enter' && canRead && void queryExecution()}
          />
          <Button variant="primary" disabled={!canRead || loading || !execId.trim()} onClick={() => void queryExecution()}>
            {t('btnQueryDetail')}
          </Button>
        </div>
        {execView && (
          <>
            <ResultRow label={t('labelExecItems')}><Badge tone="neutral">{t('itemsCount', { count: execView.items.length })}</Badge></ResultRow>
            {execView.items.length > 0 && (
              <table className="table">
                <thead><tr><th>{t('thCheck')}</th><th>{t('thLayer')}</th><th>{t('status')}</th><th>{t('thRequired')}</th><th>{t('thCheckVersion')}</th><th>{t('thEvidence')}</th></tr></thead>
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
                        <td>{it.required ? t('required') : t('optionalItem')}</td>
                        <td className="muted">{String(it.check_version ?? '—')}</td>
                        <td className="muted">{it.evidence_ref ? <MonoText>{String(it.evidence_ref)}</MonoText> : it.status === 'passed' ? t('missingEvidence') : '—'}</td>
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
            <thead><tr><th>{t('labelExecId')}</th><th>{t('labelJobId')}</th><th>{t('status')}</th><th>{t('thStartedAt')}</th><th></th></tr></thead>
            <tbody>
              {tenantExecutions.map((e) => (
                <tr key={e.executionId}>
                  <td><MonoText>{e.executionId}</MonoText></td>
                  <td><MonoText>{e.jobId ?? '—'}</MonoText></td>
                  <td>{e.status ? <StatusBadge status={e.status} fallbackLabel={e.status} /> : '—'}</td>
                  <td>{e.createdAt}</td>
                  <td><Button className="btn-xs" onClick={() => { setExecId(e.executionId); void queryExecution(e.executionId) }}>{t('detail')}</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="restore-block">
          <strong>{t('restoreTitle')}</strong>
          <p className="muted">
            {t('restoreSub')}
          </p>
          <div className="grid-2">
            <Field label={t('fieldItemIds')} hint={t('hintItemIds')}>
              <TextArea rows={3} value={itemIdsRaw} onChange={(e) => setItemIdsRaw(e.target.value)} placeholder={'item-001\nitem-002'} />
            </Field>
            <Field label={t('fieldRestoreReason')}>
              <TextArea rows={3} value={restoreReason} onChange={(e) => setRestoreReason(e.target.value)} />
            </Field>
          </div>
          <Button variant="primary" disabled={!canRestore || loading || !execId.trim()} onClick={() => void submitRestore()}>
            {t('btnGenRestore')}
          </Button>
          {!canRestore && <p className="muted">{t('restorePermHint')}</p>}
          {restoreResult && (
            <div className="row gap">
              <span><Badge tone="ok">{t('done')}</Badge> <MonoText>{restoreResult}</MonoText></span>
              <Button variant="ghost" onClick={() => navigate('optimization')}>
                <span className="btn-icon-text">{t('btnGoOptimization')} <IconArrowRight size={13} /></span>
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
