// 优化中心（P05，/optimization）：三个二级标签——问题、提案、效果（19 §3）。
// 父菜单对 knowledge.read / change.read / job.read 任一可见，标签再各自校验。

import { useState } from 'react'
import { getExecution, listJobs } from '../api/api'
import type { ExecutionView, JobItem } from '../api/types'
import { JobStatusBadge } from '../components/StatusBadge'
import { Badge, Button, Card, ErrorBanner, JsonView, MonoText, ResultRow } from '../components/ui'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { useLang } from '../i18n'
import type { MsgKey } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'
import { SeoIssues } from './SeoIssues'
import { SiteSeo } from './SiteSeo'
import { AnswerQuality } from './AnswerQuality'
import { Proposals } from './Proposals'

const TABS: { key: TabKey; labelKey: MsgKey; perm: string }[] = [
  { key: 'issues', labelKey: 'optTabIssues', perm: 'knowledge.read' },
  { key: 'siteseo', labelKey: 'optTabSiteseo', perm: 'knowledge.read' },
  { key: 'answers', labelKey: 'optTabAnswers', perm: 'knowledge.read' },
  { key: 'proposals', labelKey: 'optTabProposals', perm: 'change.read' },
  { key: 'results', labelKey: 'optTabResults', perm: 'job.read' },
]
type TabKey = 'issues' | 'siteseo' | 'answers' | 'proposals' | 'results'

export function OptimizationPage() {
  const { t } = useLang()
  const { hasScope } = useSession()
  const { focusId } = useAppState()
  const visibleTabs = TABS.filter((tab) => hasScope(tab.perm))
  // 从商品详情「发起优化提案」跳转过来时（带 focusId），直接打开提案标签
  const [tab, setTab] = useState<TabKey>(focusId ? 'proposals' : (visibleTabs[0]?.key ?? 'issues'))

  return (
    <div className="page">
      <div className="tabs">
        {visibleTabs.map((tabDef) => (
          <button key={tabDef.key} className={`tab ${tab === tabDef.key ? 'active' : ''}`} onClick={() => setTab(tabDef.key)}>{t(tabDef.labelKey)}</button>
        ))}
      </div>
      {tab === 'issues' && <SeoIssues />}
      {tab === 'siteseo' && <SiteSeo />}
      {tab === 'answers' && <AnswerQuality />}
      {tab === 'proposals' && <Proposals />}
      {tab === 'results' && <ResultsTab />}
    </div>
  )
}

// 效果记录：首期由 type=execute 的任务和执行检查派生，不做流量/AI 曝光指标（20 §2）。
function ResultsTab() {
  const { t } = useLang()
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

  const columns: Column<JobItem>[] = [
    {
      key: 'id',
      header: t('thJob'),
      render: (j) => <MonoText>{j.id}</MonoText>,
      sortValue: (j) => j.id,
      ellipsis: 220,
      titleOf: (j) => j.id,
    },
    {
      key: 'scope',
      header: t('thScope'),
      render: (j) => <span className="muted">{j.side_effect_summary || '—'}</span>,
      sortValue: (j) => j.side_effect_summary,
      ellipsis: 220,
      titleOf: (j) => j.side_effect_summary,
    },
    {
      key: 'progress',
      header: t('thCompleted'),
      render: (j) => `${j.completed_items}/${j.total_items}`,
      sortValue: (j) => (j.total_items > 0 ? j.completed_items / j.total_items : 0),
    },
    {
      key: 'status',
      header: t('status'),
      render: (j) => <JobStatusBadge status={j.status} requiresAttention={j.requires_attention} />,
      sortValue: (j) => j.status,
    },
    {
      key: 'cancel',
      header: t('thCancel'),
      render: (j) => (j.cancel_requested ? <Badge tone="warn">{t('cancelRequested')}</Badge> : '—'),
      sortValue: (j) => (j.cancel_requested ? 1 : 0),
    },
    {
      key: 'actions',
      header: '',
      render: (j) => (j.execution_id ? <Button className="btn-xs" onClick={() => void openExec(j.execution_id!)}>{t('btnCheckResult')}</Button> : null),
    },
  ]

  return (
    <>
      <ErrorBanner error={error} />
      <Card
        title={t('resultsTitle')}
        subtitle={t('resultsSub')}
      >
        <div className="row gap">
          <Button variant="primary" disabled={loading} onClick={() => void query()}>{loading ? t('querying') : t('btnQueryExec')}</Button>
        </div>
        <DataTable
          columns={columns}
          rows={jobs}
          getRowKey={(j) => j.id}
          initialSortKey="id"
          empty={loaded ? t('resultsEmptyLoaded') : t('resultsEmptyInitial')}
          emptyAction={loaded ? <Button variant="primary" onClick={() => void query()}>{t('btnRequery')}</Button> : undefined}
        />
        {exec && (
          <>
            <ResultRow label={t('labelExecId')}><MonoText>{exec.id}</MonoText></ResultRow>
            <ResultRow label={t('labelExecItems')}><Badge tone="neutral">{t('itemsCount', { count: exec.items.length })}</Badge></ResultRow>
            {exec.items.length > 0 && <JsonView value={exec.items} label={t('checksJsonLabel')} />}
          </>
        )}
      </Card>
    </>
  )
}
