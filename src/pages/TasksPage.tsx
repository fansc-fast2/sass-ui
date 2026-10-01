// 任务中心（P06，/tasks 与 /tasks/:id）：进行中、需处理、历史。
// 列表来自 GET /v1/jobs；详情展示阶段、分项、证据和副作用；技术错误与
// request_id 可展开（19 §4 P06）。取消请求不显示已恢复；恢复入口生成新提案。

import { useState } from 'react'
import { listJobs } from '../api/api'
import type { JobItem } from '../api/types'
import { JobStatusBadge } from '../components/StatusBadge'
import { Badge, Button, Card, ErrorBanner, MonoText, Select, TextInput } from '../components/ui'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { RelativeTime } from '../components/RelativeTime'
import { useLang } from '../i18n'
import { ActivityPanels } from './Activity'
import { useApiOperation } from '../state/useApiOperation'

export function TasksPage() {
  const { t } = useLang()
  const { loading, error, run } = useApiOperation()
  const [items, setItems] = useState<JobItem[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [attentionOnly, setAttentionOnly] = useState(false)

  const query = async (cursor?: string) => {
    const res = await run('GET', '/v1/jobs', () => listJobs({
      status: status || undefined,
      type: type || undefined,
      requires_attention: attentionOnly || undefined,
      limit: 20,
      cursor,
    }))
    if (res) {
      setItems(res.data.items)
      setNextCursor(res.data.next_cursor)
      setLoaded(true)
    }
  }

  const columns: Column<JobItem>[] = [
    {
      key: 'id',
      header: t('thJob'),
      render: (j) => <MonoText>{j.id}</MonoText>,
      sortValue: (j) => j.id,
      ellipsis: 220,
      titleOf: (j) => j.id,
    },
    { key: 'type', header: t('type'), render: (j) => <Badge tone="neutral">{j.type}</Badge>, sortValue: (j) => j.type },
    {
      key: 'progress',
      header: t('thProgressTotal'),
      render: (j) => `${j.completed_items}/${j.total_items}`,
      sortValue: (j) => j.total_items > 0 ? j.completed_items / j.total_items : 0,
    },
    {
      key: 'status',
      header: t('status'),
      render: (j) => (
        <>
          <JobStatusBadge status={j.status} requiresAttention={j.requires_attention} />
          {j.attention_reason && <div className="muted">{j.attention_reason}</div>}
        </>
      ),
      sortValue: (j) => j.status,
    },
    {
      key: 'side_effects',
      header: t('thSideEffects'),
      render: (j) => <span className="muted">{j.side_effect_summary || '—'}</span>,
      sortValue: (j) => j.side_effect_summary,
      ellipsis: 220,
      titleOf: (j) => j.side_effect_summary,
    },
    {
      key: 'created_at',
      header: t('thStartedAt'),
      render: (j) => <span className="muted"><RelativeTime value={j.created_at} fallback={j.created_at} /></span>,
      sortValue: (j) => j.created_at,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title={t('jobsTitle')}
        subtitle={t('jobsSub')}
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>{t('filterStatus')}</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }}>
              <option value="">{t('optAll')}</option>
              <option value="queued">{t('optQueued')}</option>
              <option value="running">{t('optRunning')}</option>
              <option value="succeeded">{t('optSucceeded')}</option>
              <option value="partial">{t('optPartial')}</option>
              <option value="failed">{t('optFailed')}</option>
              <option value="cancelled">{t('optCancelled')}</option>
            </Select>
          </label>
          <label className="inline-field">
            <span>{t('type')}</span>
            <TextInput value={type} onChange={(e) => setType(e.target.value)} style={{ width: 120 }} placeholder="sync/audit/execute" />
          </label>
          <label className="check">
            <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
            <span>{t('onlyAttention')}</span>
          </label>
          <Button variant="primary" disabled={loading} onClick={() => void query()}>{loading ? t('querying') : t('query')}</Button>
        </div>
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(j) => j.id}
          initialSortKey="created_at"
          initialSortDir="desc"
          empty={loaded ? t('jobsEmptyLoaded') : t('jobsEmptyInitial')}
          footerExtra={nextCursor ? <Button className="btn-xs" disabled={loading} onClick={() => void query(nextCursor)}>{t('loadNextPage')}</Button> : null}
        />
      </Card>

      <ActivityPanels />
    </div>
  )
}
