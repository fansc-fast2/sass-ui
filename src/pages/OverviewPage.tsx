// 工作台（P01，/overview）：AI 任务入口、需要我处理、正在执行、近期结果。
// 每个数字带统计范围与采集时间；未接入/未扫描显示状态与解释，不显示 0（19 §4）。
// 待办来自 GET /v1/action-items（issue/set/job 派生），排序由服务端给出。

import { useEffect, useState } from 'react'
import { getOverview, listActionItems, listActivityEvents, listJobs } from '../api/api'
import type { ActionItem, ActivityEventItem, JobItem, Overview } from '../api/types'
import { JobStatusBadge, overviewCardValue } from '../components/StatusBadge'
import { ListState } from '../components/ListState'
import { ActionCard, Badge, Card, EmptyState, ErrorBanner, StatCard } from '../components/ui'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { RelativeTime } from '../components/RelativeTime'
import { IconBell, IconClipboard, IconEdit, IconGlobe, IconProducts, IconRobot } from '../components/icons'
import { useLang } from '../i18n'
import { langTag } from '../i18n'
import type { MsgKey } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const PRIORITY_KEYS: Record<string, MsgKey> = {
  high: 'prioHigh',
  normal: 'prioNormal',
  low: 'prioLow',
}

export function OverviewPage() {
  const { t, lang } = useLang()
  const { active, identityUser } = useSession()
  const { health, currentTenant, navigate, tenantChangeSets, tenantExecutions, tenantJobs } = useAppState()
  const { loading, error, run } = useApiOperation()

  const [overview, setOverview] = useState<Overview | null>(null)
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [runningJobs, setRunningJobs] = useState<JobItem[]>([])
  const [events, setEvents] = useState<ActivityEventItem[]>([])

  useEffect(() => {
    void (async () => {
      const o = await run('GET', '/v1/overview', () => getOverview())
      if (o) setOverview(o.data)
      const ai = await run('GET', '/v1/action-items', () => listActionItems({ limit: 10 }))
      if (ai) setActionItems(ai.data.items)
      const j = await run('GET', '/v1/jobs', () => listJobs({ limit: 10, status: 'running' }))
      if (j) setRunningJobs(j.data.items)
      const ev = await run('GET', '/v1/activity-events', () => listActivityEvents({ limit: 8 }))
      if (ev) setEvents(ev.data.items)
    })()
    // eslint 风格：本页只加载一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const actionColumns: Column<ActionItem>[] = [
    {
      key: 'title',
      header: t('thTodo'),
      render: (a) => <span className="cell-strong">{a.title}</span>,
      sortValue: (a) => a.title,
      ellipsis: 320,
      titleOf: (a) => a.title,
    },
    {
      key: 'source',
      header: t('thSource'),
      render: (a) => (<><Badge tone="neutral">{a.source.kind}</Badge> <code className="mono">{a.source.id}</code></>),
      sortValue: (a) => a.source.kind,
    },
    { key: 'action', header: t('thAction'), render: (a) => a.action_kind, sortValue: (a) => a.action_kind },
    {
      key: 'priority',
      header: t('thPriority'),
      render: (a) => (
        <Badge tone={a.priority === 'high' ? 'err' : a.priority === 'normal' ? 'info' : 'neutral'}>
          {PRIORITY_KEYS[a.priority] ? t(PRIORITY_KEYS[a.priority]) : a.priority}
        </Badge>
      ),
      sortValue: (a) => a.priority,
    },
    {
      key: 'created_at',
      header: t('thCreatedAt'),
      render: (a) => <span className="muted"><RelativeTime value={a.created_at} fallback={a.created_at} /></span>,
      sortValue: (a) => a.created_at,
    },
  ]

  const jobColumns: Column<JobItem>[] = [
    { key: 'id', header: t('thJob'), render: (j) => (<><code className="mono">{j.id}</code> <Badge tone="neutral">{j.type}</Badge></>), sortValue: (j) => j.id, ellipsis: 220, titleOf: (j) => j.id },
    { key: 'progress', header: t('thProgress'), render: (j) => `${j.completed_items}/${j.total_items}`, sortValue: (j) => j.completed_items },
    { key: 'status', header: t('status'), render: (j) => <JobStatusBadge status={j.status} requiresAttention={j.requires_attention} /> },
  ]

  const eventColumns: Column<ActivityEventItem>[] = [
    {
      key: 'occurred_at',
      header: t('time'),
      render: (e) => <span className="muted"><RelativeTime value={e.occurred_at} /></span>,
      sortValue: (e) => e.occurred_at,
    },
    { key: 'action', header: t('thAction'), render: (e) => e.action, sortValue: (e) => e.action },
    { key: 'summary', header: t('thSummary'), render: (e) => e.summary, sortValue: (e) => e.summary, ellipsis: 340, titleOf: (e) => e.summary },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <div className="welcome">
        {active
          ? t('welcomeUser', { name: identityUser?.display_name ?? identityUser?.login ?? active.role, tenant: currentTenant })
          : t('welcomeGuest')}
      </div>

      <div className="stat-grid">
        <StatCard
          label={t('statPlatform')}
          value={health === null ? t('healthChecking') : health.ok ? t('statHealthy') : t('statUnreachable')}
          sub={health === null ? 'GET /health' : health.ok ? t('statLatencySub', { ms: health.ms }) : t('statCheckApi')}
        />
        <StatCard
          label={t('statMyRole')}
          value={active ? active.role : t('statNoTenant')}
          sub={active ? t('statRoleSub', { tenant: currentTenant }) : t('statNoTenantCtx')}
        />
        <StatCard label={t('statSessionProposals')} value={tenantChangeSets.length} sub={t('statTenantSub', { tenant: currentTenant || '—' })} />
        <StatCard label={t('statSessionExecutions')} value={tenantExecutions.length + tenantJobs.length} sub={t('statExecSub', { exec: tenantExecutions.length, jobs: tenantJobs.length })} />
      </div>

      <div className="cards">
        <Card title={t('cardOverview')} subtitle={t('cardOverviewSub')}>
          {!overview ? (
            <p className="muted">{t('loading')}</p>
          ) : (
            <>
              <div className="stat-grid tight">
                {overview.cards.map((c) => (
                  <div className="stat-card" key={c.key}>
                    <span className="stat-label">{c.key}</span>
                    <span className="stat-value">{overviewCardValue(c.value, c.status)}</span>
                    <span className="stat-sub">
                      {c.status === 'available' && c.as_of ? t('asOfTime', { time: new Date(c.as_of).toLocaleTimeString(langTag(lang), { hour12: false }) }) : t('noCardData')}
                      {' · '}{t('statRange7d', { start: overview.period_start.slice(0, 10) })}
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted">observed_at {overview.observed_at} · coverage {overview.coverage}</p>
            </>
          )}
        </Card>

        <Card title={t('cardAiEntry')} subtitle={t('cardAiEntrySub')}>
          <div className="action-grid two">
            <ActionCard
              icon={<IconRobot size={22} />}
              title={t('navAi')}
              desc={t('actionAiDesc')}
              onClick={() => navigate('ai')}
            />
            <ActionCard
              icon={<IconBell size={22} />}
              title={t('actionNotify')}
              desc={t('actionNotifyDesc')}
              onClick={() => navigate('settings')}
            />
          </div>
        </Card>
      </div>

      <Card title={t('cardActionItems')} subtitle={t('cardActionItemsSub')}>
        <ListState loading={loading} error={null} count={actionItems.length} empty={t('emptyActionItems')}>
          <DataTable
            columns={actionColumns}
            rows={actionItems}
            getRowKey={(a) => a.id}
            initialSortKey="created_at"
            initialSortDir="desc"
          />
        </ListState>
      </Card>

      <div className="cards">
        <Card title={t('cardRunning')} subtitle={t('cardRunningSub')}>
          <ListState loading={loading} error={null} count={runningJobs.length} empty={t('emptyRunning')}>
            <DataTable
              columns={jobColumns}
              rows={runningJobs}
              getRowKey={(j) => j.id}
              noFooter
            />
          </ListState>
        </Card>

        <Card title={t('cardEvents')} subtitle={t('cardEventsSub')}>
          <ListState loading={loading} error={null} count={events.length} empty={t('emptyEvents')}>
            <DataTable
              columns={eventColumns}
              rows={events}
              getRowKey={(e) => e.id}
              noFooter
            />
          </ListState>
        </Card>
      </div>

      <Card title={t('cardQuick')} subtitle={t('cardQuickSub')}>
        <div className="action-grid">
          <ActionCard icon={<IconProducts size={22} />} title={t('navGroupProducts')} desc={t('actionProductsDesc')} onClick={() => navigate('products')} />
          <ActionCard icon={<IconGlobe size={22} />} title={t('navGroupSites')} desc={t('actionSitesDesc')} onClick={() => navigate('sites')} />
          <ActionCard icon={<IconEdit size={22} />} title={t('navGroupOptimization')} desc={t('actionOptimizationDesc')} onClick={() => navigate('optimization')} />
          <ActionCard icon={<IconClipboard size={22} />} title={t('navGroupTasks')} desc={t('actionTasksDesc')} onClick={() => navigate('tasks')} />
        </div>
      </Card>

      {overview === null && loading && <EmptyState text=" " />}
    </div>
  )
}
