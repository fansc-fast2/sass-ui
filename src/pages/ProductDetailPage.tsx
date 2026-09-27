// 商品详情（P02，/products/:id）：固定显示商品身份与来源，标签为
// 概览/知识与规格/资料与证据/问题与建议/变更与发布（19 §4）。
// 规格对比区分 Strapi 当前值、知识验证结果、线上观测值；没有观测显示未检查。

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { createAuditJob, createSyncJob, getProduct, listChangeSets, listEvidence, listIssues, getProductKnowledge } from '../api/api'
import type { EvidenceDetail, IssueDetail, ProductDetail } from '../api/types'
import { Badge, Button, Card, ErrorBanner, JsonView, MonoText, ResultRow, TextInput } from '../components/ui'
import { IconChevronLeft, IconArrowRight } from '../components/icons'
import { RelativeTime } from '../components/RelativeTime'
import { toast } from '../components/Toast'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const TABS = ['概览', '知识与规格', '资料与证据', '问题与建议', '变更与发布'] as const
type Tab = (typeof TABS)[number]

export function ProductDetailPage() {
  const { hasScope } = useSession()
  const { focusId, clearFocusId, navigate, addJob, upsertChangeSet } = useAppState()
  const { loading, error, run } = useApiOperation()

  const [id, setId] = useState('')
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [tab, setTab] = useState<Tab>('概览')
  const [evidence, setEvidence] = useState<EvidenceDetail[]>([])
  const [issues, setIssues] = useState<IssueDetail[]>([])
  const [facts, setFacts] = useState<unknown[] | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [syncConn, setSyncConn] = useState('cms-main')
  const [auditSite, setAuditSite] = useState('site-us')

  const canRead = hasScope('knowledge.read')
  const canSync = hasScope('knowledge.sync')
  const canAudit = hasScope('seo.audit')
  const canPropose = hasScope('change.propose')

  useEffect(() => {
    if (!focusId) return
    const target = focusId
    clearFocusId()
    setId(target)
    void (async () => {
      const res = await run('GET', `/v1/products/${target}`, () => getProduct(target))
      if (res) setDetail(res.data)
      const kn = await run('GET', `/v1/products/${target}/knowledge`, () => getProductKnowledge(target))
      if (kn) setFacts(kn.data.facts)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const loadTab = async (t: Tab) => {
    setTab(t)
    if (!id) return
    if (t === '资料与证据' && evidence.length === 0) {
      const res = await run('GET', '/v1/evidence', () => listEvidence({ product_id: id }))
      if (res) setEvidence(res.data.items)
    }
    if (t === '问题与建议' && issues.length === 0) {
      const res = await run('GET', '/v1/issues', () => listIssues({ product_id: id, limit: 20 }))
      if (res) setIssues((res.data as unknown as { items: IssueDetail[] }).items)
    }
    if (t === '变更与发布') {
      const res = await run('GET', '/v1/change-sets', () => listChangeSets({ product_id: id, limit: 20 }))
      if (res) {
        for (const it of (res.data as unknown as { items: { id: string; status?: string }[] }).items) {
          upsertChangeSet({ id: it.id, status: it.status })
        }
      }
    }
  }

  const doSync = async () => {
    const res = await run('POST', '/v1/sync-jobs', () => createSyncJob({ connection_id: syncConn.trim(), product_ids: [id] }))
    if (res) {
      addJob({ jobId: res.data.job_id, kind: 'sync', createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }), lastStatus: res.data.status })
      setActionMsg(`同步已受理：${res.data.job_id}`)
      toast.ok(`同步知识已受理：${res.data.job_id}（${res.data.status}），可在任务中心跟踪`)
    }
  }
  const doAudit = async () => {
    const res = await run('POST', '/v1/audit-jobs', () => createAuditJob({ site_id: auditSite.trim(), product_ids: [id] }))
    if (res) {
      addJob({ jobId: res.data.job_id, kind: 'audit', createdAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }), lastStatus: res.data.status })
      setActionMsg(`审计已受理：${res.data.job_id}`)
      toast.ok(`审计已受理：${res.data.job_id}（${res.data.status}），可在任务中心跟踪`)
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title="商品详情"
        subtitle="商品身份与来源固定显示；变体与市场切换不改变基础商品身份（19 §4 P02）"
        actions={<Button variant="ghost" onClick={() => navigate('products')}>
          <span className="btn-icon-text"><IconChevronLeft size={13} /> 返回目录</span>
        </Button>}
      >
        <div className="row gap">
          <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="product_id" style={{ maxWidth: 260 }} />
          <Button
            disabled={!canRead || loading || !id.trim()}
            onClick={() => navigate('product-detail', id.trim())}
          >
            {loading ? '加载中…' : '加载'}
          </Button>
        </div>
        {!detail && <p className="muted">输入商品 ID 加载详情（骨架阶段商品投影未接入，可先走通流程）。</p>}
        {detail && (
          <>
            <div className="result-col">
              <ResultRow label="商品">
                <strong>{detail.product.name}</strong>
                {detail.product.model ? <span className="muted"> / {detail.product.model}</span> : null}
                {' '}<MonoText>{detail.product.id}</MonoText>
              </ResultRow>
              <ResultRow label="来源">
                <MonoText>{detail.product.connection_id}</MonoText>
                {detail.cms_view_url && <> · <a href={detail.cms_view_url} target="_blank" rel="noreferrer">CMS 来源</a></>}
              </ResultRow>
              <ResultRow label="站点">{detail.product.site_ids.join(', ') || '—'}</ResultRow>
              <ResultRow label="新鲜度">
                <Badge tone={detail.product.freshness === 'current' ? 'ok' : detail.product.freshness === 'stale' ? 'warn' : 'neutral'}>
                  {detail.product.freshness}
                </Badge>
                <span className="muted"> 源更新 <RelativeTime value={detail.product.source_updated_at} fallback={detail.product.source_updated_at} /> · 同步 <RelativeTime value={detail.product.synced_at} fallback={detail.product.synced_at} /></span>
              </ResultRow>
            </div>

            <div className="row gap wrap">
              <TextInput value={syncConn} onChange={(e) => setSyncConn(e.target.value)} style={{ width: 140 }} />
              <Button disabled={!canSync || loading || !id} onClick={() => void doSync()}>同步知识</Button>
              <TextInput value={auditSite} onChange={(e) => setAuditSite(e.target.value)} style={{ width: 140 }} />
              <Button disabled={!canAudit || loading || !id} onClick={() => void doAudit()}>发起审计</Button>
              <Button variant="primary" disabled={!canPropose || !id} onClick={() => navigate('optimization', id)}>发起优化提案</Button>
              <Button variant="ghost" onClick={() => navigate('tasks')}>
                <span className="btn-icon-text">任务中心 <IconArrowRight size={13} /></span>
              </Button>
            </div>
            {!canSync && <p className="muted">同步需要 analyst 及以上；提案需要 change.propose 权限。</p>}
            {actionMsg && <p><Badge tone="ok">已受理</Badge> <MonoText>{actionMsg}</MonoText></p>}

            <div className="tabs">
              {TABS.map((t) => (
                <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => void loadTab(t)}>{t}</button>
              ))}
            </div>

            {tab === '概览' && (
              <div className="result-col">
                <ResultRow label="变体">{detail.variant_ids.length > 0 ? detail.variant_ids.join(', ') : '（无变体）'}</ResultRow>
                <ResultRow label="源版本"><MonoText>{detail.source_revision || '—'}</MonoText></ResultRow>
                <ResultRow label="Strapi 当前值">
                  {detail.source_fields.length === 0
                    ? <span className="muted">未检查（骨架阶段无字段投影）</span>
                    : <code className="mono">{detail.source_fields.length} 个字段</code>}
                </ResultRow>
                {detail.page_observations.length === 0 ? (
                  <ResultRow label="线上观测值"><span className="muted">未检查——不推断等于 Strapi 当前值（19 §4 P02）</span></ResultRow>
                ) : (
                  <table className="table">
                    <thead><tr><th>字段</th><th>比较状态</th><th>条件 / 映射版本</th><th>说明</th></tr></thead>
                    <tbody>
                      {detail.page_observations.map((o, i) => (
                        <tr key={i}>
                          <td><MonoText>{o.field_path}</MonoText></td>
                          <td>
                            <Badge tone={o.comparison_status === 'ready' ? 'ok' : o.comparison_status === 'incomparable' ? 'err' : 'neutral'}>
                              {o.comparison_status === 'ready' ? '可比' : o.comparison_status === 'incomparable' ? '不可比' : '未检查'}
                            </Badge>
                          </td>
                          <td className="muted">{o.conditions_id ?? '—'} / {o.mapping_version ?? '—'}</td>
                          <td className="muted">{o.comparison_reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === '知识与规格' && (
              <>
                <ResultRow label="知识事实">
                  <Badge tone="neutral">{facts ? `${facts.length} 条` : '未加载'}</Badge>
                </ResultRow>
                {facts && facts.length === 0 && <p className="muted">还没有知识事实——先执行「同步知识」。</p>}
                {facts && facts.length > 0 && <JsonView value={facts} label="facts（精确 typed_value）" />}
              </>
            )}

            {tab === '资料与证据' && (
              <ListOrEmpty count={evidence.length} empty="该商品暂无可见证据（证据 ACL 按权限过滤）">
                <table className="table">
                  <thead><tr><th>证据 ID</th><th>来源版本</th><th>访问级别</th><th>公开使用</th><th>摘录</th></tr></thead>
                  <tbody>
                    {evidence.map((ev) => (
                      <tr key={ev.id}>
                        <td><MonoText>{ev.id}</MonoText></td>
                        <td>{ev.source_version}</td>
                        <td><Badge tone="neutral">{ev.access}</Badge></td>
                        <td><Badge tone={ev.public_disclosure === 'approved' ? 'ok' : 'warn'}>{ev.public_disclosure}</Badge></td>
                        <td>{ev.can_view_excerpt && ev.excerpt ? <span className="muted">{ev.excerpt.slice(0, 60)}</span> : <span className="muted">无权查看摘录</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ListOrEmpty>
            )}

            {tab === '问题与建议' && (
              <ListOrEmpty count={issues.length} empty="该商品暂无可见问题">
                <table className="table">
                  <thead><tr><th>问题</th><th>严重度</th><th>状态</th><th>字段</th><th>建议</th></tr></thead>
                  <tbody>
                    {issues.map((is) => (
                      <tr key={is.id}>
                        <td><MonoText>{is.id}</MonoText> {is.message}</td>
                        <td><Badge tone={is.severity === 'blocker' ? 'err' : is.severity === 'warning' ? 'warn' : 'neutral'}>{is.severity}</Badge></td>
                        <td>{is.status}</td>
                        <td>{is.field_path ?? '—'}</td>
                        <td>{is.recommendation ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ListOrEmpty>
            )}

            {tab === '变更与发布' && (
              <p className="muted">该商品的变更历史在「优化中心 / 提案」按 product_id 筛选查看；发布任务在「任务中心」。</p>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function ListOrEmpty({ count, empty, children }: { count: number; empty: string; children: ReactNode }) {
  if (count === 0) return <p className="muted">{empty}</p>
  return <>{children}</>
}
