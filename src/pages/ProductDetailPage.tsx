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
import { useLang } from '../i18n'
import { langTag } from '../i18n'
import type { MsgKey } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const TABS: { key: string; labelKey: MsgKey }[] = [
  { key: 'overview', labelKey: 'tabOverview' },
  { key: 'knowledge', labelKey: 'tabKnowledge' },
  { key: 'evidence', labelKey: 'tabEvidence' },
  { key: 'issues', labelKey: 'tabIssueSuggestions' },
  { key: 'changes', labelKey: 'tabChanges' },
]

export function ProductDetailPage() {
  const { t, lang } = useLang()
  const { hasScope } = useSession()
  const { focusId, clearFocusId, navigate, addJob, upsertChangeSet } = useAppState()
  const { loading, error, run } = useApiOperation()

  const [id, setId] = useState('')
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [tab, setTab] = useState<string>('overview')
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

  const loadTab = async (key: string) => {
    setTab(key)
    if (!id) return
    if (key === 'evidence' && evidence.length === 0) {
      const res = await run('GET', '/v1/evidence', () => listEvidence({ product_id: id }))
      if (res) setEvidence(res.data.items)
    }
    if (key === 'issues' && issues.length === 0) {
      const res = await run('GET', '/v1/issues', () => listIssues({ product_id: id, limit: 20 }))
      if (res) setIssues((res.data as unknown as { items: IssueDetail[] }).items)
    }
    if (key === 'changes') {
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
      addJob({ jobId: res.data.job_id, kind: 'sync', createdAt: new Date().toLocaleTimeString(langTag(lang), { hour12: false }), lastStatus: res.data.status })
      setActionMsg(t('syncAcceptedMsg', { id: res.data.job_id }))
      toast.ok(t('syncAcceptedToast', { id: res.data.job_id, status: res.data.status }))
    }
  }
  const doAudit = async () => {
    const res = await run('POST', '/v1/audit-jobs', () => createAuditJob({ site_id: auditSite.trim(), product_ids: [id] }))
    if (res) {
      addJob({ jobId: res.data.job_id, kind: 'audit', createdAt: new Date().toLocaleTimeString(langTag(lang), { hour12: false }), lastStatus: res.data.status })
      setActionMsg(t('auditAcceptedMsg', { id: res.data.job_id }))
      toast.ok(t('auditAcceptedToast', { id: res.data.job_id, status: res.data.status }))
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title={t('pageProductDetail')}
        subtitle={t('productDetailSub')}
        actions={<Button variant="ghost" onClick={() => navigate('products')}>
          <span className="btn-icon-text"><IconChevronLeft size={13} /> {t('backToCatalog')}</span>
        </Button>}
      >
        <div className="row gap">
          <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="product_id" style={{ maxWidth: 260 }} />
          <Button
            disabled={!canRead || loading || !id.trim()}
            onClick={() => navigate('product-detail', id.trim())}
          >
            {loading ? t('loading') : t('btnLoad')}
          </Button>
        </div>
        {!detail && <p className="muted">{t('productNeedIdHint')}</p>}
        {detail && (
          <>
            <div className="result-col">
              <ResultRow label={t('labelProduct')}>
                <strong>{detail.product.name}</strong>
                {detail.product.model ? <span className="muted"> / {detail.product.model}</span> : null}
                {' '}<MonoText>{detail.product.id}</MonoText>
              </ResultRow>
              <ResultRow label={t('labelSource')}>
                <MonoText>{detail.product.connection_id}</MonoText>
                {detail.cms_view_url && <> · <a href={detail.cms_view_url} target="_blank" rel="noreferrer">{t('cmsSourceLink')}</a></>}
              </ResultRow>
              <ResultRow label={t('labelSites')}>{detail.product.site_ids.join(', ') || '—'}</ResultRow>
              <ResultRow label={t('thFreshness')}>
                <Badge tone={detail.product.freshness === 'current' ? 'ok' : detail.product.freshness === 'stale' ? 'warn' : 'neutral'}>
                  {detail.product.freshness}
                </Badge>
                <span className="muted"> {t('srcUpdatedLabel')} <RelativeTime value={detail.product.source_updated_at} fallback={detail.product.source_updated_at} /> · {t('syncedLabel')} <RelativeTime value={detail.product.synced_at} fallback={detail.product.synced_at} /></span>
              </ResultRow>
            </div>

            <div className="row gap wrap">
              <TextInput value={syncConn} onChange={(e) => setSyncConn(e.target.value)} style={{ width: 140 }} />
              <Button disabled={!canSync || loading || !id} onClick={() => void doSync()}>{t('btnSyncKnowledge')}</Button>
              <TextInput value={auditSite} onChange={(e) => setAuditSite(e.target.value)} style={{ width: 140 }} />
              <Button disabled={!canAudit || loading || !id} onClick={() => void doAudit()}>{t('btnStartAudit')}</Button>
              <Button variant="primary" disabled={!canPropose || !id} onClick={() => navigate('optimization', id)}>{t('btnProposeOptimization')}</Button>
              <Button variant="ghost" onClick={() => navigate('tasks')}>
                <span className="btn-icon-text">{t('navGroupTasks')} <IconArrowRight size={13} /></span>
              </Button>
            </div>
            {!canSync && <p className="muted">{t('syncPermHint')}</p>}
            {actionMsg && <p><Badge tone="ok">{t('accepted')}</Badge> <MonoText>{actionMsg}</MonoText></p>}

            <div className="tabs">
              {TABS.map((tabDef) => (
                <button key={tabDef.key} className={`tab ${tab === tabDef.key ? 'active' : ''}`} onClick={() => void loadTab(tabDef.key)}>{t(tabDef.labelKey)}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="result-col">
                <ResultRow label={t('labelVariants')}>{detail.variant_ids.length > 0 ? detail.variant_ids.join(', ') : t('noVariants')}</ResultRow>
                <ResultRow label={t('labelSourceRevision')}><MonoText>{detail.source_revision || '—'}</MonoText></ResultRow>
                <ResultRow label={t('labelStrapiCurrent')}>
                  {detail.source_fields.length === 0
                    ? <span className="muted">{t('notCheckedNoProjection')}</span>
                    : <code className="mono">{t('fieldsCount', { count: detail.source_fields.length })}</code>}
                </ResultRow>
                {detail.page_observations.length === 0 ? (
                  <ResultRow label={t('labelPageObservation')}><span className="muted">{t('notCheckedNoInfer')}</span></ResultRow>
                ) : (
                  <table className="table">
                    <thead><tr><th>{t('thCompareField')}</th><th>{t('thCompareStatus')}</th><th>{t('thConditions')}</th><th>{t('thNote')}</th></tr></thead>
                    <tbody>
                      {detail.page_observations.map((o, i) => (
                        <tr key={i}>
                          <td><MonoText>{o.field_path}</MonoText></td>
                          <td>
                            <Badge tone={o.comparison_status === 'ready' ? 'ok' : o.comparison_status === 'incomparable' ? 'err' : 'neutral'}>
                              {o.comparison_status === 'ready' ? t('cmpReady') : o.comparison_status === 'incomparable' ? t('cmpIncomparable') : t('cardNotChecked')}
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

            {tab === 'knowledge' && (
              <>
                <ResultRow label={t('labelFacts')}>
                  <Badge tone="neutral">{facts ? t('itemsCount', { count: facts.length }) : t('factsNotLoaded')}</Badge>
                </ResultRow>
                {facts && facts.length === 0 && <p className="muted">{t('emptyFacts')}</p>}
                {facts && facts.length > 0 && <JsonView value={facts} label={t('factsJsonLabel')} />}
              </>
            )}

            {tab === 'evidence' && (
              <ListOrEmpty count={evidence.length} empty={t('productEmptyEvidence')}>
                <table className="table">
                  <thead><tr><th>{t('thEvidenceId')}</th><th>{t('thSourceVersion')}</th><th>{t('thAccessLevel')}</th><th>{t('thPublicUse')}</th><th>{t('thExcerpt')}</th></tr></thead>
                  <tbody>
                    {evidence.map((ev) => (
                      <tr key={ev.id}>
                        <td><MonoText>{ev.id}</MonoText></td>
                        <td>{ev.source_version}</td>
                        <td><Badge tone="neutral">{ev.access}</Badge></td>
                        <td><Badge tone={ev.public_disclosure === 'approved' ? 'ok' : 'warn'}>{ev.public_disclosure}</Badge></td>
                        <td>{ev.can_view_excerpt && ev.excerpt ? <span className="muted">{ev.excerpt.slice(0, 60)}</span> : <span className="muted">{t('noExcerptPerm')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ListOrEmpty>
            )}

            {tab === 'issues' && (
              <ListOrEmpty count={issues.length} empty={t('productEmptyIssues')}>
                <table className="table">
                  <thead><tr><th>{t('thIssue')}</th><th>{t('thSeverity')}</th><th>{t('status')}</th><th>{t('thFieldPath')}</th><th>{t('thSuggestion')}</th></tr></thead>
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

            {tab === 'changes' && (
              <p className="muted">{t('productChangesHint')}</p>
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
