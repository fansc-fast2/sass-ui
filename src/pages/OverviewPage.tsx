// 工作台（P01，/overview）：AI 任务入口、需要我处理、正在执行、近期结果。
// 每个数字带统计范围与采集时间；未接入/未扫描显示状态与解释，不显示 0（19 §4）。
// 待办来自 GET /v1/action-items（issue/set/job 派生），排序由服务端给出。

import { useEffect, useState } from 'react'
import { getOverview, listActionItems, listActivityEvents, listJobs } from '../api/api'
import type { ActionItem, ActivityEventItem, JobItem, Overview } from '../api/types'
import { JobStatusBadge, overviewCardValue } from '../components/StatusBadge'
import { ListState } from '../components/ListState'
import { ActionCard, Badge, Card, EmptyState, ErrorBanner, StatCard } from '../components/ui'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

export function OverviewPage() {
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

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <div className="welcome">
        {active
          ? <>你好，<strong>{identityUser?.display_name ?? identityUser?.login ?? active.role}</strong>。当前租户 <strong>{currentTenant}</strong>。</>
          : <>欢迎使用 Platform Console。先登录身份并选择租户（右上角「登录」）。</>}
      </div>

      <div className="stat-grid">
        <StatCard
          label="平台服务"
          value={health === null ? '检测中…' : health.ok ? '正常运行' : '不可达'}
          sub={health === null ? 'GET /health' : health.ok ? `延迟 ${health.ms}ms · 每10秒巡检` : '请检查 pm2 里的 platform-api'}
        />
        <StatCard
          label="我的角色"
          value={active ? active.role : '未选择租户'}
          sub={active ? `${currentTenant} · 按成员关系授权` : '暂无租户上下文'}
        />
        <StatCard label="本会话提案" value={tenantChangeSets.length} sub={`租户 ${currentTenant || '—'}`} />
        <StatCard label="本会话执行" value={tenantExecutions.length + tenantJobs.length} sub={`执行 ${tenantExecutions.length} · 任务 ${tenantJobs.length}`} />
      </div>

      <div className="cards">
        <Card title="数据概况" subtitle="GET /v1/overview · 卡片状态区分可用/未接通/未检查/不可用，未接入不显示 0">
          {!overview ? (
            <p className="muted">加载中…</p>
          ) : (
            <>
              <div className="stat-grid tight">
                {overview.cards.map((c) => (
                  <div className="stat-card" key={c.key}>
                    <span className="stat-label">{c.key}</span>
                    <span className="stat-value">{overviewCardValue(c.value, c.status)}</span>
                    <span className="stat-sub">
                      {c.status === 'available' && c.as_of ? `截至 ${new Date(c.as_of).toLocaleTimeString('zh-CN', { hour12: false })}` : '当前会话无数据'}
                      {' · '}统计范围 {overview.period_start.slice(0, 10)} 起 7 天
                    </span>
                  </div>
                ))}
              </div>
              <p className="muted">observed_at {overview.observed_at} · coverage {overview.coverage}</p>
            </>
          )}
        </Card>

        <Card title="AI 任务入口" subtitle="AI 工作区按对象上下文发起检查与候选生成">
          <div className="action-grid two">
            <ActionCard
              icon="🤖"
              title="AI 工作区"
              desc="独立工作区按阶段接入；未接通时只提供只读入口"
              onClick={() => navigate('ai')}
            />
            <ActionCard
              icon="🔔"
              title="通知"
              desc="当前用户通知与已读标记（notification.read）"
              onClick={() => navigate('settings')}
            />
          </div>
        </Card>
      </div>

      <Card title="需要我处理" subtitle="GET /v1/action-items · 由问题/提案/任务派生；同一对象合并为同一待办">
        <ListState loading={loading} error={null} count={actionItems.length} empty="没有待处理事项——待办由问题、提案和执行异常自动派生">
          <table className="table">
            <thead><tr><th>待办</th><th>来源</th><th>动作</th><th>优先级</th><th>创建时间</th></tr></thead>
            <tbody>
              {actionItems.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td><Badge tone="neutral">{a.source.kind}</Badge> <code className="mono">{a.source.id}</code></td>
                  <td>{a.action_kind}</td>
                  <td><Badge tone={a.priority === 'high' ? 'err' : a.priority === 'normal' ? 'info' : 'neutral'}>{a.priority}</Badge></td>
                  <td>{a.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListState>
      </Card>

      <div className="cards">
        <Card title="正在执行" subtitle="GET /v1/jobs · running 状态（requires_attention 时显示需要处理）">
          <ListState loading={loading} error={null} count={runningJobs.length} empty="当前没有执行中的任务">
            <table className="table">
              <thead><tr><th>任务</th><th>进度</th><th>状态</th></tr></thead>
              <tbody>
                {runningJobs.map((j) => (
                  <tr key={j.id}>
                    <td><code className="mono">{j.id}</code> <Badge tone="neutral">{j.type}</Badge></td>
                    <td>{j.completed_items}/{j.total_items}</td>
                    <td><JobStatusBadge status={j.status} requiresAttention={j.requires_attention} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ListState>
        </Card>

        <Card title="近期结果" subtitle="GET /v1/activity-events · 可见业务活动摘要（非平台全量审计）">
          <ListState loading={loading} error={null} count={events.length} empty="暂无业务活动记录">
            <table className="table">
              <thead><tr><th>时间</th><th>动作</th><th>摘要</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.occurred_at).toLocaleTimeString('zh-CN', { hour12: false })}</td>
                    <td>{e.action}</td>
                    <td>{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ListState>
        </Card>
      </div>

      <Card title="快捷入口" subtitle="按日常工作流组织的入口">
        <div className="action-grid">
          <ActionCard icon="📦" title="商品与知识" desc="商品目录、知识详情、证据与问题" onClick={() => navigate('products')} />
          <ActionCard icon="🌐" title="站点与渠道" desc="站点列表、连接状态、检查覆盖" onClick={() => navigate('sites')} />
          <ActionCard icon="✏️" title="优化中心" desc="问题处理、提案确认、效果记录" onClick={() => navigate('optimization')} />
          <ActionCard icon="📋" title="任务中心" desc="任务列表、分项状态、取消与恢复" onClick={() => navigate('tasks')} />
        </div>
      </Card>

      {overview === null && loading && <EmptyState text=" " />}
    </div>
  )
}
