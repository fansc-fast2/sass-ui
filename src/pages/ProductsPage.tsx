// 商品与知识（P02，/products）：来源商品目录及知识状态。
// 列表来自 GET /v1/products（Strapi 只读投影），支持 q/site_id/freshness/
// knowledge_status 筛选 + cursor 分页；行点击进入商品详情。

import { useEffect, useState } from 'react'
import { listProducts } from '../api/api'
import type { ProductSummary } from '../api/types'
import { ListState } from '../components/ListState'
import { Badge, Button, Card, ErrorBanner, Field, TextInput, Select } from '../components/ui'
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

        <ListState
          loading={loading && loaded}
          error={null}
          count={items.length}
          empty={loaded ? '没有匹配的商品——当前后端为骨架数据源，商品投影接入后此处展示真实目录' : '输入筛选条件后点击查询'}
        >
          <table className="table">
            <thead><tr><th>名称/型号</th><th>来源连接</th><th>站点</th><th>同步时间</th><th>新鲜度</th><th>知识状态</th><th>可见问题</th><th></th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.model ? <span className="muted"> / {p.model}</span> : null}</td>
                  <td><code className="mono">{p.connection_id}</code></td>
                  <td>{p.site_ids.join(', ') || '—'}</td>
                  <td className="muted">{p.synced_at}</td>
                  <td><Badge tone={p.freshness === 'current' ? 'ok' : p.freshness === 'stale' ? 'warn' : 'neutral'}>{FRESHNESS_LABELS[p.freshness] ?? p.freshness}</Badge></td>
                  <td>{p.knowledge_status}</td>
                  <td>{p.visible_issue_count}</td>
                  <td><Button className="btn-xs" onClick={() => navigate('product-detail', p.id)}>详情</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListState>
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
