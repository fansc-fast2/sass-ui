// 答案质量（SG02，24 §1）：型号/变体/市场一致性、声明逐条有证据、页面可见性、
// 反虚构检查，以及摘要/问答候选。原则：无出处的声明零发布——界面明确标出
// 被剔除的声明与证据引用（前端可定位事实）。

import { useState } from 'react'
import { listAnswerReviews, reviewAnswer } from '../api/api'
import type { SeoAnswerReview, SeoClaimInput } from '../api/types'
import { useLang } from '../i18n'
import type { MsgKey } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useApiOperation } from '../state/useApiOperation'
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, JsonView, MonoText, ResultRow, TextArea, TextInput,
} from '../components/ui'
import { FullTime } from '../components/RelativeTime'

const CHECK_STATUS_TONE: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  pass: 'ok',
  flagged: 'warn',
  unpublishable: 'err',
  not_checked: 'neutral',
}

const CHECK_KEYS: Record<string, MsgKey> = {
  'ANS-SCOPE-01': 'ansScope01',
  'ANS-EVID-01': 'ansEvid01',
  'ANS-VIS-01': 'ansVis01',
  'ANS-FABR-01': 'ansFabr01',
}

interface ClaimDraft extends Partial<SeoClaimInput> {
  key: number
}

let claimKey = 0
const newClaim = (): ClaimDraft => ({ key: ++claimKey, field: '', value: '', fact_id: '', source_ref: '' })

export function AnswerQuality() {
  const { t } = useLang()
  const { hasScope } = useSession()
  const { loading, error, run } = useApiOperation()

  const [productId, setProductId] = useState('')
  const [variantId, setVariantId] = useState('v1')
  const [market, setMarket] = useState('DE')
  const [locale, setLocale] = useState('de-DE')
  const [model, setModel] = useState('')
  const [pageUrl, setPageUrl] = useState('')
  const [claims, setClaims] = useState<ClaimDraft[]>([newClaim()])
  const [review, setReview] = useState<SeoAnswerReview | null>(null)
  const [reviews, setReviews] = useState<SeoAnswerReview[]>([])
  const [claimsText, setClaimsText] = useState('')

  const canRead = hasScope('knowledge.read')

  const submit = async () => {
    const body = {
      product_id: productId.trim(),
      variant_id: variantId.trim() || undefined,
      market: market.trim() || undefined,
      locale: locale.trim() || undefined,
      model: model.trim() || undefined,
      page_url: pageUrl.trim() || undefined,
      claims: claims
        .filter((c) => c.field?.trim() && c.value?.trim())
        .map((c) => ({
          field: c.field!.trim(), value: c.value!, fact_id: c.fact_id?.trim() ?? '',
          source_ref: c.source_ref?.trim() ?? '', fact_version: c.fact_version,
        })),
    }
    const res = await run('POST', '/v1/seo/answer-reviews', () => reviewAnswer(body))
    if (res) setReview(res.data)
  }

  const loadReviews = async () => {
    const res = await run('GET', '/v1/seo/answer-reviews', () => listAnswerReviews())
    if (res) setReviews(res.data.items)
  }

  const addFromText = () => {
    // 批量导入：每行 field | value | fact_id | source_ref
    const rows = claimsText.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((p) => p.length >= 2 && p[0])
    if (rows.length === 0) return
    setClaims((prev) => [...prev.filter((c) => c.field?.trim()), ...rows.map((p) => ({
      key: ++claimKey, field: p[0], value: p[1], fact_id: p[2] ?? '', source_ref: p[3] ?? '',
    }))])
    setClaimsText('')
  }

  return (
    <>
      <ErrorBanner error={error} />
      <Card
        title={t('answerCardTitle')}
        subtitle={t('answerCardSub')}
      >
        <div className="row gap wrap">
          <Field label={t('fieldProductId')}><TextInput value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="prod-1" style={{ width: 160 }} /></Field>
          <Field label={t('fieldVariant')}><TextInput value={variantId} onChange={(e) => setVariantId(e.target.value)} style={{ width: 110 }} /></Field>
          <Field label={t('fieldMarket')}><TextInput value={market} onChange={(e) => setMarket(e.target.value)} style={{ width: 90 }} /></Field>
          <Field label={t('fieldLocale')}><TextInput value={locale} onChange={(e) => setLocale(e.target.value)} style={{ width: 120 }} /></Field>
          <Field label={t('fieldModel')}><TextInput value={model} onChange={(e) => setModel(e.target.value)} placeholder="Trail Runner X" style={{ width: 180 }} /></Field>
        </div>
        <Field label={t('fieldPageUrl')} hint={t('hintPageUrl')}>
          <TextInput value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="http://127.0.0.1:1339/de/products/prod-1" />
        </Field>

        <div className="col gap">
          {claims.map((c, i) => (
            <div key={c.key} className="row gap wrap" style={{ alignItems: 'flex-end' }}>
              <Field label={t('claimFieldLabel', { n: i + 1 })}>
                <TextInput value={c.field ?? ''} onChange={(e) => setClaims((p) => p.map((x) => x.key === c.key ? { ...x, field: e.target.value } : x))} placeholder="material" style={{ width: 140 }} />
              </Field>
              <Field label={t('fieldValue')}>
                <TextInput value={c.value ?? ''} onChange={(e) => setClaims((p) => p.map((x) => x.key === c.key ? { ...x, value: e.target.value } : x))} placeholder="recycled knit upper" style={{ width: 220 }} />
              </Field>
              <Field label={t('fieldFactId')}>
                <TextInput value={c.fact_id ?? ''} onChange={(e) => setClaims((p) => p.map((x) => x.key === c.key ? { ...x, fact_id: e.target.value } : x))} placeholder="f-1" style={{ width: 110 }} />
              </Field>
              <Field label={t('fieldSourceRef')}>
                <TextInput value={c.source_ref ?? ''} onChange={(e) => setClaims((p) => p.map((x) => x.key === c.key ? { ...x, source_ref: e.target.value } : x))} placeholder="spec_sheet:v3#p2" style={{ width: 200 }} />
              </Field>
              <Button className="btn-xs" onClick={() => setClaims((p) => p.filter((x) => x.key !== c.key))}>{t('remove')}</Button>
            </div>
          ))}
          <div className="row gap">
            <Button onClick={() => setClaims((p) => [...p, newClaim()])}>{t('btnAddClaim')}</Button>
            <Button variant="primary" disabled={!canRead || loading || !productId.trim()} onClick={() => void submit()}>
              {loading ? t('reviewing') : t('btnSubmitReview')}
            </Button>
            <Button disabled={!canRead || loading} onClick={() => void loadReviews()}>{t('btnRefreshReviews')}</Button>
          </div>
          {!canRead && <p className="muted">{t('noPermRead')}</p>}
        </div>

        <Field label={t('fieldBulkClaims')} hint={t('hintBulkClaims')}>
          <TextArea rows={2} value={claimsText} onChange={(e) => setClaimsText(e.target.value)} placeholder={'model | Trail Runner X | f-1 | spec:v3#p1\nmaterial | recycled knit | f-2 | spec:v3#p2'} />
        </Field>
        <Button disabled={!claimsText.trim()} onClick={addFromText}>{t('btnImportClaims')}</Button>
      </Card>

      {review && (
        <Card title={t('reviewResultTitle')} subtitle={t('reviewResultSub', { fp: `${review.fingerprint.slice(0, 16)}…` })}>
          <ResultRow label={t('labelCoverage')}>
            <Badge tone={review.coverage === 'complete' ? 'ok' : 'warn'}>
              {review.coverage === 'complete' ? t('ansCovComplete') : t('ansCovPartial')}
            </Badge>
          </ResultRow>
          <ResultRow label={t('labelClaimStats')}>
            <Badge tone={review.unpublishable_claims.length > 0 ? 'warn' : 'ok'}>
              {t('claimStatsBadge', { evidenced: review.evidenced_claims, dropped: review.unpublishable_claims.length })}
            </Badge>
          </ResultRow>
          {review.unpublishable_claims.length > 0 && (
            <ResultRow label={t('labelDroppedClaims')}>
              <span className="muted">
                {review.unpublishable_claims.map((c) => t('droppedClaimItem', { field: c.field, value: c.value, fact: c.fact_id || 'fact_id', source: c.source_ref || 'source_ref' })).join('；')}
              </span>
            </ResultRow>
          )}
          <ResultRow label={t('labelSummaryCandidate')}><span>{review.summary || t('emptySummary')}</span></ResultRow>

          <table className="table">
            <thead><tr><th>{t('thCheckItem')}</th><th>{t('field')}</th><th>{t('thResult')}</th><th>{t('thObserve')}</th><th>{t('thEvidence')}</th></tr></thead>
            <tbody>
              {review.checks.map((c, i) => (
                <tr key={i}>
                  <td title={c.check_id}>{CHECK_KEYS[c.check_id] ? t(CHECK_KEYS[c.check_id]) : c.check_id}</td>
                  <td><MonoText>{c.field}</MonoText></td>
                  <td><Badge tone={CHECK_STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge></td>
                  <td className="muted" style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{c.observed}</td>
                  <td><MonoText>{c.evidence_ref.length > 28 ? c.evidence_ref.slice(0, 28) + '…' : c.evidence_ref}</MonoText></td>
                </tr>
              ))}
            </tbody>
          </table>

          <ResultRow label={t('labelQaCandidates')}><Badge tone="neutral">{t('qaBadge', { count: review.qa_candidates.length })}</Badge></ResultRow>
          {review.qa_candidates.length > 0 && <JsonView value={review.qa_candidates} label={t('labelQaCandidates')} />}
        </Card>
      )}

      {reviews.length > 0 && (
        <Card title={t('reviewHistoryTitle')} subtitle={t('reviewHistorySub')}>
          <table className="table">
            <thead><tr><th>{t('thProduct')}</th><th>{t('thVariant')}</th><th>{t('thMarket')}</th><th>{t('thEvidenced')}</th><th>{t('thZeroPublish')}</th><th>{t('thCoverage')}</th><th>{t('time')}</th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.fingerprint}>
                  <td><MonoText>{r.product_id}</MonoText></td>
                  <td>{r.variant_id || '—'}</td>
                  <td>{r.market || '—'}</td>
                  <td>{r.evidenced_claims}</td>
                  <td>{r.unpublishable_claims.length}</td>
                  <td><Badge tone={r.coverage === 'complete' ? 'ok' : 'warn'}>{r.coverage}</Badge></td>
                  <td className="muted"><FullTime value={r.checked_at} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {review === null && reviews.length === 0 && (
        <EmptyState text={t('answerEmpty')} />
      )}
    </>
  )
}
