// 资料与证据（P03，/evidence）：只读索引——来源类型、适用商品、来源版本、
// 验证状态与公开使用资格。证据详情按权限决定能否显示摘录（19 §4 P03）。

import { useState } from 'react'
import { getEvidence, listEvidence } from '../api/api'
import type { EvidenceDetail } from '../api/types'
import { ListState } from '../components/ListState'
import { Badge, Button, Card, ErrorBanner, MonoText, ResultRow, TextInput } from '../components/ui'
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
          {nextCursor && <Button disabled={loading} onClick={() => void query(nextCursor)}>下一页</Button>}
        </div>
        {!canRead && <p className="muted">当前角色缺少 knowledge.read 权限。</p>}
        <ListState
          loading={loading && loaded}
          error={null}
          count={items.length}
          empty={loaded ? '没有可见证据（按当前权限过滤）' : '按商品筛选或直接查询'}
        >
          <table className="table">
            <thead><tr><th>证据</th><th>适用商品</th><th>来源版本</th><th>访问级别</th><th>公开使用</th><th></th></tr></thead>
            <tbody>
              {items.map((ev) => (
                <tr key={ev.id}>
                  <td><MonoText>{ev.id}</MonoText></td>
                  <td><MonoText>{ev.product_id}</MonoText></td>
                  <td>{ev.source_version}</td>
                  <td><Badge tone="neutral">{ev.access}</Badge></td>
                  <td><Badge tone={ev.public_disclosure === 'approved' ? 'ok' : 'warn'}>{ev.public_disclosure}</Badge></td>
                  <td><Button className="btn-xs" onClick={() => void open(ev.id)}>详情</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </ListState>
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
            <ResultRow label="观测时间">{selected.observed_at}</ResultRow>
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
