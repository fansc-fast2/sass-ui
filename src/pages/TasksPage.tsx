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
import { ActivityPanels } from './Activity'
import { useApiOperation } from '../state/useApiOperation'

export function TasksPage() {
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
      header: '任务',
      render: (j) => <MonoText>{j.id}</MonoText>,
      sortValue: (j) => j.id,
      ellipsis: 220,
      titleOf: (j) => j.id,
    },
    { key: 'type', header: '类型', render: (j) => <Badge tone="neutral">{j.type}</Badge>, sortValue: (j) => j.type },
    {
      key: 'progress',
      header: '完成项 / 总项',
      render: (j) => `${j.completed_items}/${j.total_items}`,
      sortValue: (j) => j.total_items > 0 ? j.completed_items / j.total_items : 0,
    },
    {
      key: 'status',
      header: '状态',
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
      header: '副作用',
      render: (j) => <span className="muted">{j.side_effect_summary || '—'}</span>,
      sortValue: (j) => j.side_effect_summary,
      ellipsis: 220,
      titleOf: (j) => j.side_effect_summary,
    },
    {
      key: 'created_at',
      header: '发起时间',
      render: (j) => <span className="muted"><RelativeTime value={j.created_at} fallback={j.created_at} /></span>,
      sortValue: (j) => j.created_at,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title="任务列表"
        subtitle="GET /v1/jobs · 展示任务类型、对象范围、完成项/总项、真实状态与副作用；聚合状态由确定性映射产生"
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>状态</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 140 }}>
              <option value="">（全部）</option>
              <option value="queued">等待执行</option>
              <option value="running">正在处理</option>
              <option value="succeeded">已完成</option>
              <option value="partial">部分完成</option>
              <option value="failed">执行异常</option>
              <option value="cancelled">已取消</option>
            </Select>
          </label>
          <label className="inline-field">
            <span>类型</span>
            <TextInput value={type} onChange={(e) => setType(e.target.value)} style={{ width: 120 }} placeholder="sync/audit/execute" />
          </label>
          <label className="check">
            <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
            <span>只看需要处理</span>
          </label>
          <Button variant="primary" disabled={loading} onClick={() => void query()}>{loading ? '查询中…' : '查询'}</Button>
        </div>
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(j) => j.id}
          initialSortKey="created_at"
          initialSortDir="desc"
          empty={loaded ? '没有匹配的任务——调整状态/类型筛选后重新查询' : '按状态/类型筛选后点击查询'}
          footerExtra={nextCursor ? <Button className="btn-xs" disabled={loading} onClick={() => void query(nextCursor)}>加载下一页</Button> : null}
        />
      </Card>

      <ActivityPanels />
    </div>
  )
}
