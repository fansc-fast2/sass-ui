// 站内 SEO 检测（SG01，24 §1）：触发受控扫描 → 12 规则 findings → 复核豁免。
// 语义对齐后端：not_checked/抓取失败不计为不合格（覆盖率 partial 即有未观测页）。

import { useState } from 'react'
import { listSeoFindings, runSeoScan, setSeoFindingStatus } from '../api/api'
import type { SeoFinding, SeoScanResult } from '../api/types'
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
        title="站内扫描"
        subtitle="SG01：按 URL 清单做受控抓取并跑 12 条 SEO 规则；抓取失败/被阻断的页记为未观测，不计为不合格"
      >
        <div className="col gap">
          <div className="row gap wrap">
            <Field label="站点 ID">
              <TextInput value={siteId} onChange={(e) => setSiteId(e.target.value)} placeholder="site-1" style={{ width: 200 }} />
            </Field>
            <Field label="商品 ID（可选，逗号分隔与 URL 对齐）">
              <TextInput value={productIdsText} onChange={(e) => setProductIdsText(e.target.value)} placeholder="p1, p2" style={{ width: 260 }} />
            </Field>
          </div>
          <Field label="页面 URL（每行一个；必须能通过平台出站白名单）" hint="开发环境可用 PK_SEO_DEV_EGRESS=1 放行本地子站 http 地址">
            <TextArea rows={3} value={urlsText} onChange={(e) => setUrlsText(e.target.value)} placeholder={'http://127.0.0.1:1339/de/products/a1\nhttp://127.0.0.1:1339/de/products/b2'} />
          </Field>
          <div className="row gap">
            <Button variant="primary" disabled={!canRead || loading || urls.length === 0} onClick={() => void doScan()}>
              {loading ? '扫描中…' : `扫描 ${urls.length || 0} 个页面`}
            </Button>
            <Button disabled={!canRead || loading} onClick={() => void loadFindings()}>刷新 findings 清单</Button>
          </div>
          {!canRead && <p className="muted">当前角色缺少 knowledge.read 权限。</p>}
        </div>
        {scan && (
          <>
            <ResultRow label="覆盖率">
              <Badge tone={scan.coverage === 'complete' ? 'ok' : 'warn'}>
                {scan.coverage === 'complete' ? 'complete（全部页面已观测）' : 'partial（存在未观测页）'}
              </Badge>
            </ResultRow>
            <ResultRow label="结果统计">
              <Badge tone="neutral">{scan.total_findings} 条发现 · {scan.total_pages} 页 · 跳过 {scan.skipped_count} 页</Badge>
            </ResultRow>
            <table className="table">
              <thead><tr><th>页面</th><th>抓取</th><th>HTTP</th><th>解析观测</th><th>发现</th><th>错误</th></tr></thead>
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

      <Card title="Findings 清单" subtitle="同一对象的重复发现按指纹合并刷新 last_seen；豁免需 tenant_admin">
        <div className="row gap wrap">
          <TextInput value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} placeholder="按 rule_id 筛选（如 SEO-META-02）" style={{ width: 280 }} />
          <Button disabled={!canRead || loading} onClick={() => void loadFindings()}>应用筛选</Button>
        </div>
        {findings.length === 0
          ? <EmptyState text="还没有发现——先跑一次扫描（清单为空也可能是全部规则通过）" />
          : (
            <table className="table">
              <thead><tr><th>规则</th><th>严重度</th><th>状态</th><th>对象</th><th>观察</th><th></th></tr></thead>
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
                        <Button className="btn-xs" disabled={!canAdmin || loading} onClick={() => void dismiss(f.fingerprint)}>豁免</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        {!canAdmin && <p className="muted">豁免（dismissed）需要 tenant_admin 角色。</p>}
      </Card>
    </>
  )
}
