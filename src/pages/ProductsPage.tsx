// 商品与知识（P02，/products）：来源商品目录及知识状态。
// 列表来自 GET /v1/products（Strapi 只读投影），支持 q/site_id/freshness/
// knowledge_status 筛选 + cursor 分页；行点击进入商品详情。

import { useEffect, useState } from 'react'
import { listProducts } from '../api/api'
import type { ProductSummary } from '../api/types'
import { Badge, Button, Card, ErrorBanner, Field, TextInput, Select } from '../components/ui'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { RelativeTime } from '../components/RelativeTime'
import { useLang } from '../i18n'
import type { MsgKey } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const FRESHNESS_KEYS: Record<string, MsgKey> = {
  current: 'freshCurrent',
  stale: 'freshStale',
  unknown: 'freshUnknown',
}

export function ProductsPage() {
  const { t } = useLang()
  const { hasScope } = useSession()
  const { navigate, focusId, clearFocusId } = useAppState()
  const { loading, error, run } = useApiOperation()

  const [items, setItems] = useState<ProductSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [q, setQ] = useState('')
  const [siteId, setSiteId] = useState('')
  const [freshness, setFreshness] = useState('')
  const [directId, setDirectId] = useState('')

  const canRead = hasScope('knowledge.read')

  // 从其他页面带着 focusId 跳转过来时直接打开详情
  useEffect(() => {
    if (focusId) {
      const id = focusId
      clearFocusId()
      navigate('product-detail', id)
    }
  }, [focusId, clearFocusId, navigate])

  const query = async (cursor?: string) => {
    const res = await run('GET', '/v1/products', () => listProducts({
      q: q || undefined,
      site_id: siteId || undefined,
      freshness: freshness || undefined,
      limit: 20,
      cursor,
    }))
    if (res) {
      setItems(res.data.items)
      setNextCursor(res.data.next_cursor)
      setLoaded(true)
    }
  }

  const columns: Column<ProductSummary>[] = [
    {
      key: 'name',
      header: t('thNameModel'),
      render: (p) => (<span className="cell-strong"><strong>{p.name}</strong>{p.model ? <span className="muted"> / {p.model}</span> : null}</span>),
      sortValue: (p) => p.name,
      ellipsis: 260,
      titleOf: (p) => (p.model ? `${p.name} / ${p.model}` : p.name),
    },
    {
      key: 'connection',
      header: t('thConnection'),
      render: (p) => <code className="mono">{p.connection_id}</code>,
      sortValue: (p) => p.connection_id,
    },
    {
      key: 'sites',
      header: t('thSites'),
      render: (p) => p.site_ids.join(', ') || '—',
      sortValue: (p) => p.site_ids.join(','),
    },
    {
      key: 'synced_at',
      header: t('thSyncedAt'),
      render: (p) => <span className="muted"><RelativeTime value={p.synced_at} fallback={p.synced_at} /></span>,
      sortValue: (p) => p.synced_at ?? '',
    },
    {
      key: 'freshness',
      header: t('thFreshness'),
      render: (p) => (
        <Badge tone={p.freshness === 'current' ? 'ok' : p.freshness === 'stale' ? 'warn' : 'neutral'}>
          {FRESHNESS_KEYS[p.freshness] ? t(FRESHNESS_KEYS[p.freshness]) : p.freshness}
        </Badge>
      ),
      sortValue: (p) => p.freshness,
    },
    { key: 'knowledge_status', header: t('thKnowledgeStatus'), render: (p) => p.knowledge_status, sortValue: (p) => p.knowledge_status },
    { key: 'issues', header: t('thIssues'), render: (p) => p.visible_issue_count, sortValue: (p) => p.visible_issue_count },
    {
      key: 'actions',
      header: '',
      render: (p) => <Button className="btn-xs" onClick={() => navigate('product-detail', p.id)}>{t('detail')}</Button>,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title={t('productsTitle')}
        subtitle={t('productsSub')}
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>{t('filterKeyword')}</span>
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} placeholder={t('phNameModel')} />
          </label>
          <label className="inline-field">
            <span>{t('filterSite')}</span>
            <TextInput value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ width: 130 }} placeholder="site-us" />
          </label>
          <label className="inline-field">
            <span>{t('filterFreshness')}</span>
            <Select value={freshness} onChange={(e) => setFreshness(e.target.value)} style={{ width: 110 }}>
              <option value="">{t('optAll')}</option>
              <option value="current">{t('freshCurrent')}</option>
              <option value="stale">{t('freshStale')}</option>
              <option value="unknown">{t('freshUnknown')}</option>
            </Select>
          </label>
          <Button variant="primary" disabled={!canRead || loading} onClick={() => void query()}>
            {loading ? t('querying') : t('query')}
          </Button>
          {nextCursor && <Button disabled={!canRead || loading} onClick={() => void query(nextCursor)}>{t('next')}</Button>}
        </div>
        {!canRead && <p className="muted">{t('noPermRead')}</p>}

        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(p) => p.id}
          onRowClick={(p) => navigate('product-detail', p.id)}
          initialSortKey="name"
          empty={loaded ? t('productsEmptyLoaded') : t('productsEmptyInitial')}
          footerExtra={nextCursor ? <Button className="btn-xs" disabled={!canRead || loading} onClick={() => void query(nextCursor)}>{t('loadNextPage')}</Button> : null}
        />
      </Card>

      <Card title={t('directOpenTitle')} subtitle={t('directOpenSub')}>
        <div className="row gap">
          <Field label="product_id">
            <TextInput value={directId} onChange={(e) => setDirectId(e.target.value)} placeholder="prod-001" style={{ width: 220 }} />
          </Field>
          <Button variant="primary" disabled={!directId.trim()} onClick={() => navigate('product-detail', directId.trim())}>
            {t('btnOpenDetail')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
