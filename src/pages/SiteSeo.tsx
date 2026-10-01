// 站内 SEO 检测（SG01，24 §1）：触发受控扫描 → 12 规则 findings → 复核豁免。
// 语义对齐后端：not_checked/抓取失败不计为不合格（覆盖率 partial 即有未观测页）。

import { useState } from 'react'
import { listSeoFindings, runSeoScan, setSeoFindingStatus } from '../api/api'
import type { SeoFinding, SeoScanResult } from '../api/types'
import { useLang } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useApiOperation } from '../state/useApiOperation'
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, MonoText, ResultRow, TextArea, TextInput,
} from '../components/ui'

const SEVERITY_TONE: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  blocker: 'err',
  warning: 'warn',
  info: 'neutral',
}

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  open: 'warn',
  dismissed: 'neutral',
  resolved: 'ok',
  proposed: 'neutral',
  not_checked: 'neutral',
}

export function SiteSeo() {
  const { t } = useLang()
  const { hasScope } = useSession()
  const { loading, error, run } = useApiOperation()

  const [siteId, setSiteId] = useState('')
  const [urlsText, setUrlsText] = useState('')
  const [productIdsText, setProductIdsText] = useState('')
  const [scan, setScan] = useState<SeoScanResult | null>(null)
  const [findings, setFindings] = useState<SeoFinding[]>([])
  const [ruleFilter, setRuleFilter] = useState('')

  const canRead = hasScope('knowledge.read')
  const canAdmin = hasScope('workspace.admin') // tenant_admin 会话携带

  const urls = urlsText.split('\n').map((s) => s.trim()).filter(Boolean)
  const productIds = productIdsText.split(',').map((s) => s.trim()).filter(Boolean)

  const doScan = async () => {
    const pages: Record<string, { product_id?: string; expected_publication: 'public' }> = {}
    urls.forEach((u, i) => {
      pages[u] = { expected_publication: 'public', ...(productIds[i] ? { product_id: productIds[i] } : {}) }
    })
    const res = await run('POST', '/v1/seo/scans', () =>
      runSeoScan({ site_id: siteId.trim() || 'site-1', urls, pages }))
    if (res) {
      setScan(res.data)
      setFindings(res.data.findings)
    }
  }

  const loadFindings = async () => {
    const res = await run('GET', '/v1/seo/findings', () =>
      listSeoFindings(ruleFilter ? { rule_id: ruleFilter } : {}))
    if (res) setFindings(res.data.items)
  }

  const dismiss = async (fingerprint: string) => {
    const res = await run('POST', `/v1/seo/findings/${fingerprint}/status`, () =>
      setSeoFindingStatus(fingerprint, 'dismissed'))
    if (res) {
      setFindings((prev) => prev.map((f) => (f.fingerprint === fingerprint ? { ...f, status: 'dismissed' } : f)))
    }
  }

  return (
    <>
      <ErrorBanner error={error} />
      <Card
        title={t('scanCardTitle')}
        subtitle={t('scanCardSub')}
      >
        <div className="col gap">
          <div className="row gap wrap">
            <Field label={t('fieldSiteId')}>
              <TextInput value={siteId} onChange={(e) => setSiteId(e.target.value)} placeholder="site-1" style={{ width: 200 }} />
            </Field>
            <Field label={t('fieldProductIds')}>
              <TextInput value={productIdsText} onChange={(e) => setProductIdsText(e.target.value)} placeholder="p1, p2" style={{ width: 260 }} />
            </Field>
          </div>
          <Field label={t('fieldPageUrls')} hint={t('hintEgress')}>
            <TextArea rows={3} value={urlsText} onChange={(e) => setUrlsText(e.target.value)} placeholder={'http://127.0.0.1:1339/de/products/a1\nhttp://127.0.0.1:1339/de/products/b2'} />
          </Field>
          <div className="row gap">
            <Button variant="primary" disabled={!canRead || loading || urls.length === 0} onClick={() => void doScan()}>
              {loading ? t('scanning') : t('btnScan', { count: urls.length || 0 })}
            </Button>
            <Button disabled={!canRead || loading} onClick={() => void loadFindings()}>{t('btnRefreshFindings')}</Button>
          </div>
          {!canRead && <p className="muted">{t('noPermRead')}</p>}
        </div>
        {scan && (
          <>
            <ResultRow label={t('labelCoverage')}>
              <Badge tone={scan.coverage === 'complete' ? 'ok' : 'warn'}>
                {scan.coverage === 'complete' ? t('covComplete') : t('covPartial')}
              </Badge>
            </ResultRow>
            <ResultRow label={t('labelScanStats')}>
              <Badge tone="neutral">{t('scanStatsBadge', { findings: scan.total_findings, pages: scan.total_pages, skipped: scan.skipped_count })}</Badge>
            </ResultRow>
            <table className="table">
              <thead><tr><th>{t('thPage')}</th><th>{t('thFetch')}</th><th>HTTP</th><th>{t('thObservedParse')}</th><th>{t('thFindings')}</th><th>{t('thError')}</th></tr></thead>
              <tbody>
                {scan.pages.map((p) => (
                  <tr key={p.url}>
                    <td><MonoText>{p.url.length > 48 ? p.url.slice(0, 48) + '…' : p.url}</MonoText></td>
                    <td><Badge tone={p.fetch_status === 'fetched' ? 'ok' : 'warn'}>{p.fetch_status}</Badge></td>
                    <td>{p.http_status || '—'}</td>
                    <td>{p.observations}</td>
                    <td>{p.findings_count}</td>
                    <td className="muted">{p.error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card title={t('findingsCardTitle')} subtitle={t('findingsCardSub')}>
        <div className="row gap wrap">
          <TextInput value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} placeholder={t('phRuleFilter')} style={{ width: 280 }} />
          <Button disabled={!canRead || loading} onClick={() => void loadFindings()}>{t('btnApplyFilter')}</Button>
        </div>
        {findings.length === 0
          ? <EmptyState text={t('findingsEmpty')} />
          : (
            <table className="table">
              <thead><tr><th>{t('thRule')}</th><th>{t('thSeverity')}</th><th>{t('status')}</th><th>{t('thSubject')}</th><th>{t('thObserve')}</th><th></th></tr></thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.fingerprint}>
                    <td><MonoText>{f.rule_id}</MonoText></td>
                    <td><Badge tone={SEVERITY_TONE[f.severity] ?? 'neutral'}>{f.severity}</Badge></td>
                    <td><Badge tone={STATUS_TONE[f.status] ?? 'neutral'}>{f.status}</Badge></td>
                    <td className="muted" style={{ maxWidth: 220, overflowWrap: 'anywhere' }}>{f.subject}</td>
                    <td className="muted" style={{ maxWidth: 320, overflowWrap: 'anywhere' }}>{f.observed}</td>
                    <td>
                      {f.status === 'open' && (
                        <Button className="btn-xs" disabled={!canAdmin || loading} onClick={() => void dismiss(f.fingerprint)}>{t('btnDismissFinding')}</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {!canAdmin && <p className="muted">{t('noPermDismiss')}</p>}
      </Card>
    </>
  )
}
