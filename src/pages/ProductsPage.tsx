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
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const FRESHNESS_LABELS: Record<string, string> = {
  current: '新鲜',
  stale: '滞后',
  unknown: '未知',
}

export function ProductsPage() {
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
      header: '名称 / 型号',
      render: (p) => (<span className="cell-strong"><strong>{p.name}</strong>{p.model ? <span className="muted"> / {p.model}</span> : null}</span>),
      sortValue: (p) => p.name,
      ellipsis: 260,
      titleOf: (p) => (p.model ? `${p.name} / ${p.model}` : p.name),
    },
    {
      key: 'connection',
      header: '来源连接',
      render: (p) => <code className="mono">{p.connection_id}</code>,
      sortValue: (p) => p.connection_id,
    },
    {
      key: 'sites',
      header: '站点',
      render: (p) => p.site_ids.join(', ') || '—',
      sortValue: (p) => p.site_ids.join(','),
    },
    {
      key: 'synced_at',
      header: '同步时间',
      render: (p) => <span className="muted"><RelativeTime value={p.synced_at} fallback={p.synced_at} /></span>,
      sortValue: (p) => p.synced_at ?? '',
    },
    {
      key: 'freshness',
      header: '新鲜度',
      render: (p) => (
        <Badge tone={p.freshness === 'current' ? 'ok' : p.freshness === 'stale' ? 'warn' : 'neutral'}>
          {FRESHNESS_LABELS[p.freshness] ?? p.freshness}
        </Badge>
      ),
      sortValue: (p) => p.freshness,
    },
    { key: 'knowledge_status', header: '知识状态', render: (p) => p.knowledge_status, sortValue: (p) => p.knowledge_status },
    { key: 'issues', header: '可见问题', render: (p) => p.visible_issue_count, sortValue: (p) => p.visible_issue_count },
    {
      key: 'actions',
      header: '',
      render: (p) => <Button className="btn-xs" onClick={() => navigate('product-detail', p.id)}>详情</Button>,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title="商品目录"
        subtitle="GET /v1/products · Strapi 商品只读投影：名称/图片可能滞后，以 source_updated_at 与 freshness 为准"
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>关键词</span>
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 160 }} placeholder="名称/型号" />
          </label>
          <label className="inline-field">
            <span>站点</span>
            <TextInput value={siteId} onChange={(e) => setSiteId(e.target.value)} style={{ width: 130 }} placeholder="site-us" />
          </label>
          <label className="inline-field">
            <span>新鲜度</span>
            <Select value={freshness} onChange={(e) => setFreshness(e.target.value)} style={{ width: 110 }}>
              <option value="">（全部）</option>
              <option value="current">新鲜</option>
              <option value="stale">滞后</option>
              <option value="unknown">未知</option>
            </Select>
          </label>
          <Button variant="primary" disabled={!canRead || loading} onClick={() => void query()}>
            {loading ? '查询中…' : '查询'}
          </Button>
          {nextCursor && <Button disabled={!canRead || loading} onClick={() => void query(nextCursor)}>下一页</Button>}
        </div>
        {!canRead && <p className="muted">当前角色缺少 knowledge.read 权限。</p>}

        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(p) => p.id}
          onRowClick={(p) => navigate('product-detail', p.id)}
          initialSortKey="name"
          empty={loaded
            ? '没有匹配的商品——可调整关键词或站点筛选；后端商品投影接入后此处展示真实目录'
            : '输入筛选条件后点击查询，或直接在下方用商品 ID 打开详情'}
          footerExtra={nextCursor ? <Button className="btn-xs" disabled={!canRead || loading} onClick={() => void query(nextCursor)}>加载下一页</Button> : null}
        />
      </Card>

      <Card title="直接打开商品" subtitle="列表数据接入前，可用商品 ID 直接进入详情页完成检查与提案流程">
        <div className="row gap">
          <Field label="product_id">
            <TextInput value={directId} onChange={(e) => setDirectId(e.target.value)} placeholder="prod-001" style={{ width: 220 }} />
          </Field>
          <Button variant="primary" disabled={!directId.trim()} onClick={() => navigate('product-detail', directId.trim())}>
            打开详情
          </Button>
        </div>
      </Card>
    </div>
  )
}
