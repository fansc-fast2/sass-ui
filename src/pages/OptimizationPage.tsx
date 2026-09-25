// 优化中心（P05，/optimization）：三个二级标签——问题、提案、效果（19 §3）。
// 父菜单对 knowledge.read / change.read / job.read 任一可见，标签再各自校验。

import { useState } from 'react'
import { getExecution, listJobs } from '../api/api'
import type { ExecutionView, JobItem } from '../api/types'
import { JobStatusBadge } from '../components/StatusBadge'
import { ListState } from '../components/ListState'
import { Badge, Button, Card, ErrorBanner, JsonView, MonoText, ResultRow } from '../components/ui'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'
import { SeoIssues } from './SeoIssues'
import { Proposals } from './Proposals'

const TABS = [
  { key: 'issues', label: '问题', perm: 'knowledge.read' },
  { key: 'proposals', label: '提案', perm: 'change.read' },
  { key: 'results', label: '效果', perm: 'job.read' },
] as const
type TabKey = (typeof TABS)[number]['key']

export function OptimizationPage() {
  const { hasScope } = useSession()
  const { focusId } = useAppState()
  const visibleTabs = TABS.filter((t) => hasScope(t.perm))
  // 从商品详情「发起优化提案」跳转过来时（带 focusId），直接打开提案标签
  const [tab, setTab] = useState<TabKey>(focusId ? 'proposals' : (visibleTabs[0]?.key ?? 'issues'))

  return (
    <div className="page">
      <div className="tabs">
        {visibleTabs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'issues' && <SeoIssues />}
      {tab === 'proposals' && <Proposals />}
      {tab === 'results' && <ResultsTab />}
    </div>
  )
}

// 效果记录：首期由 type=execute 的任务和执行检查派生，不做流量/AI 曝光指标（20 §2）。
function ResultsTab() {
  const { loading, error, run } = useApiOperation()
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [exec, setExec] = useState<ExecutionView | null>(null)

  const query = async () => {
    const res = await run('GET', '/v1/jobs', () => listJobs({ type: 'execute', limit: 20 }))
    if (res) {
      setJobs(res.data.items)
      setLoaded(true)
    }
  }

  const openExec = async (id: string) => {
    const res = await run('GET', `/v1/executions/${id}`, () => getExecution(id))
    if (res) setExec(res.data)
  }

  return (
    <>
      <ErrorBanner error={error} />
      <Card
        title="效果记录"
        subtitle="实际页面检查结果由 type=execute 的任务与执行检查派生；首期不含流量或 AI 曝光指标"
      >
        <div className="row gap">
          <Button variant="primary" disabled={loading} onClick={() => void query()}>{loading ? '查询中…' : '查询执行记录'}</Button>
        </div>
        <ListState
          loading={loading && loaded}
          error={null}
          count={jobs.length}
          empty={loaded ? '还没有执行记录——提案执行后出现在这里' : '点击查询加载'}
        >
          <table className="table">
            <thead><tr><th>任务</th><th>对象范围</th><th>完成项</th><th>状态</th><th>副作用</th><th></th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><MonoText>{j.id}</MonoText></td>
                  <td className="muted">{j.side_effect_summary || '—'}</td>
                  <td>{j.completed_items}/{j.total_items}</td>
                  <td><JobStatusBadge status={j.status} requiresAttention={j.requires_attention} /></td>
                  <td>{j.cancel_requested ? <Badge tone="warn">取消已请求</Badge> : '—'}</td>
                  <td>
                    {j.execution_id && <Button className="btn-xs" onClick={() => void openExec(j.execution_id!)}>检查结果</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListState>
        {exec && (
          <>
            <ResultRow label="执行编号"><MonoText>{exec.id}</MonoText></ResultRow>
            <ResultRow label="执行项"><Badge tone="neutral">{exec.items.length} 条</Badge></ResultRow>
            {exec.items.length > 0 && <JsonView value={exec.items} label="三层检查结果（data/publish/page）" />}
          </>
        )}
      </Card>
    </>
  )
}
