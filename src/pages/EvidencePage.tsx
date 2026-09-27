// 资料与证据（P03，/evidence）：只读索引——来源类型、适用商品、来源版本、
// 验证状态与公开使用资格。证据详情按权限决定能否显示摘录（19 §4 P03）。

import { useState } from 'react'
import { getEvidence, listEvidence } from '../api/api'
import type { EvidenceDetail } from '../api/types'
import { Badge, Button, Card, ErrorBanner, MonoText, ResultRow, TextInput } from '../components/ui'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { FullTime } from '../components/RelativeTime'
import { useSession } from '../session/SessionContext'
import { useApiOperation } from '../state/useApiOperation'

export function EvidencePage() {
  const { hasScope } = useSession()
  const { loading, error, run } = useApiOperation()
  const [items, setItems] = useState<EvidenceDetail[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [productId, setProductId] = useState('')
  const [selected, setSelected] = useState<EvidenceDetail | null>(null)

  const canRead = hasScope('knowledge.read')

  const query = async (cursor?: string) => {
    const res = await run('GET', '/v1/evidence', () => listEvidence({
      product_id: productId || undefined,
      limit: 20,
      cursor,
    }))
    if (res) {
      setItems(res.data.items)
      setNextCursor(res.data.next_cursor)
      setLoaded(true)
    }
  }

  const open = async (id: string) => {
    const res = await run('GET', `/v1/evidence/${id}`, () => getEvidence(id))
    if (res) setSelected(res.data)
  }

  const columns: Column<EvidenceDetail>[] = [
    {
      key: 'id',
      header: '证据',
      render: (ev) => <MonoText>{ev.id}</MonoText>,
      sortValue: (ev) => ev.id,
      ellipsis: 200,
      titleOf: (ev) => ev.id,
    },
    {
      key: 'product_id',
      header: '适用商品',
      render: (ev) => <MonoText>{ev.product_id}</MonoText>,
      sortValue: (ev) => ev.product_id,
    },
    { key: 'source_version', header: '来源版本', render: (ev) => ev.source_version, sortValue: (ev) => ev.source_version },
    { key: 'access', header: '访问级别', render: (ev) => <Badge tone="neutral">{ev.access}</Badge>, sortValue: (ev) => ev.access },
    {
      key: 'public_disclosure',
      header: '公开使用',
      render: (ev) => <Badge tone={ev.public_disclosure === 'approved' ? 'ok' : 'warn'}>{ev.public_disclosure}</Badge>,
      sortValue: (ev) => ev.public_disclosure,
    },
    {
      key: 'actions',
      header: '',
      render: (ev) => <Button className="btn-xs" onClick={() => void open(ev.id)}>详情</Button>,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title="证据索引"
        subtitle="GET /v1/evidence · 只读索引；无权者不返回原文、对象路径或签名地址（19 §4 P03）"
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>商品</span>
            <TextInput value={productId} onChange={(e) => setProductId(e.target.value)} style={{ width: 160 }} placeholder="prod-001" />
          </label>
          <Button variant="primary" disabled={!canRead || loading} onClick={() => void query()}>
            {loading ? '查询中…' : '查询'}
          </Button>
        </div>
        {!canRead && <p className="muted">当前角色缺少 knowledge.read 权限。</p>}
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(ev) => ev.id}
          initialSortKey="product_id"
          empty={loaded ? '没有可见证据——结果按当前身份与站点权限过滤；换有权限的账号或调整商品筛选' : '按商品筛选或直接查询可见证据'}
          footerExtra={nextCursor ? <Button className="btn-xs" disabled={loading} onClick={() => void query(nextCursor)}>加载下一页</Button> : null}
        />
      </Card>

      {selected && (
        <Card title="证据详情" subtitle="摘录可见性由当前权限决定；can_view_excerpt=false 时不返回原文">
          <div className="result-col">
            <ResultRow label="证据 ID"><MonoText>{selected.id}</MonoText></ResultRow>
            <ResultRow label="来源版本">{selected.source_version}</ResultRow>
            <ResultRow label="可见性">
              <Badge tone={selected.visibility === 'content' ? 'ok' : 'warn'}>
                {selected.visibility === 'content' ? '内容可见' : '仅元数据（v1.8）'}
              </Badge>
            </ResultRow>
            <ResultRow label="来源哈希">
              {selected.source_hash ? <MonoText>{selected.source_hash.slice(0, 24)}…</MonoText> : <span className="muted">（元数据层不返回内容哈希）</span>}
            </ResultRow>
            <ResultRow label="观测时间"><FullTime value={selected.observed_at} fallback={selected.observed_at} /></ResultRow>
            <ResultRow label="摘录">
              {selected.can_view_excerpt && selected.excerpt
                ? <span>{selected.excerpt}</span>
                : <span className="muted">无权查看摘录（access={selected.access}）</span>}
            </ResultRow>
          </div>
        </Card>
      )}
    </div>
  )
}
