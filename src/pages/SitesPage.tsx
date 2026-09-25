// 站点与渠道（P04，/sites 与 /sites/:id）：站点列表与详情。
// 连接配置在设置管理，本页只展示状态并链接过去，不形成两套配置（19 §4）。

import { useEffect, useState } from 'react'
import { getCapabilities, getSite, listSites } from '../api/api'
import type { Capabilities, SiteSummary } from '../api/types'
import { Badge, Button, Card, ErrorBanner, JsonView, MonoText, ResultRow, TextInput } from '../components/ui'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  active: 'ok',
  read_only: 'warn',
  disconnected: 'err',
  suspended: 'err',
}

export function SitesPage() {
  const { navigate, focusId, clearFocusId } = useAppState()
  const { loading, error, run } = useApiOperation()
  const [sites, setSites] = useState<SiteSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [directId, setDirectId] = useState('')

  useEffect(() => {
    if (focusId) {
      const id = focusId
      clearFocusId()
      navigate('site-detail', id)
    }
  }, [focusId, clearFocusId, navigate])

  const query = async () => {
    const res = await run('GET', '/v1/sites', () => listSites({ limit: 20 }))
    if (res) {
      setSites(res.data.items)
      setLoaded(true)
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card title="站点列表" subtitle="GET /v1/sites · 可见站点集合；站点是页面筛选范围，租户是安全边界（19 §2）">
        <div className="row gap">
          <Button variant="primary" disabled={loading} onClick={() => void query()}>{loading ? '查询中…' : '查询站点'}</Button>
        </div>
        {sites.length > 0 && (
          <table className="table">
            <thead><tr><th>站点</th><th>域名</th><th>市场 / 语言</th><th>连接状态</th><th>最近同步</th><th></th></tr></thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong> <MonoText>{s.id}</MonoText></td>
                  <td className="muted">{s.public_host || '—'}</td>
                  <td className="muted">{s.markets.join('/')} · {s.locales.join('/')}</td>
                  <td><Badge tone={STATUS_TONES[s.status] ?? 'neutral'}>{s.status}</Badge></td>
                  <td className="muted">{s.last_synced_at ?? '—'}</td>
                  <td><Button className="btn-xs" onClick={() => navigate('site-detail', s.id)}>详情</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sites.length === 0 && loaded && <p className="muted">没有可见站点（站点引用由控制层/连接注册同步，骨架阶段为空）。</p>}
      </Card>

      <Card title="直接打开站点" subtitle="站点数据接入前，可用站点 ID 直接进入详情页">
        <div className="row gap">
          <TextInput value={directId} onChange={(e) => setDirectId(e.target.value)} placeholder="site-us" style={{ width: 220 }} />
          <Button variant="primary" disabled={!directId.trim()} onClick={() => navigate('site-detail', directId.trim())}>打开详情</Button>
        </div>
      </Card>
    </div>
  )
}

export function SiteDetailPage() {
  const { focusId, clearFocusId, navigate } = useAppState()
  const { loading, error, run } = useApiOperation()
  const [id, setId] = useState('')
  const [site, setSite] = useState<SiteSummary | null>(null)
  const [caps, setCaps] = useState<Capabilities | null>(null)

  useEffect(() => {
    if (!focusId) return
    const target = focusId
    clearFocusId()
    setId(target)
    void (async () => {
      const res = await run('GET', `/v1/sites/${target}`, () => getSite(target))
      if (res) setSite(res.data)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const loadCaps = async (connId: string) => {
    const res = await run('GET', `/v1/connections/${connId}/capabilities`, () => getCapabilities(connId))
    if (res) setCaps(res.data)
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title="站点详情"
        subtitle="依次查看概览、关联商品、检查覆盖、发布记录与连接能力（19 §4 P04）"
        actions={<Button variant="ghost" onClick={() => navigate('sites')}>← 返回站点</Button>}
      >
        <div className="row gap">
          <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="site_id" style={{ maxWidth: 260 }} />
          <Button
            disabled={loading || !id.trim()}
            onClick={() => navigate('site-detail', id.trim())}
          >
            {loading ? '加载中…' : '加载'}
          </Button>
        </div>
        {site && (
          <>
            <div className="result-col">
              <ResultRow label="站点"><strong>{site.name}</strong> <MonoText>{site.id}</MonoText></ResultRow>
              <ResultRow label="域名">{site.public_host || '—'}</ResultRow>
              <ResultRow label="市场 / 语言">{site.markets.join('/')} · {site.locales.join('/')}</ResultRow>
              <ResultRow label="连接状态"><Badge tone={STATUS_TONES[site.status] ?? 'neutral'}>{site.status}</Badge></ResultRow>
              <ResultRow label="最近同步">{site.last_synced_at ?? '未同步'}</ResultRow>
            </div>
            <div className="row gap wrap">
              {site.connection_ids.length === 0 && <span className="muted">（骨架阶段无连接引用，可手动查询连接能力）</span>}
              {site.connection_ids.map((c) => (
                <Button key={c} onClick={() => void loadCaps(c)}>查询 {c} 能力</Button>
              ))}
            </div>
            {caps && <JsonView value={caps} label="连接能力" />}
            <div className="row gap">
              <Button onClick={() => navigate('products')}>关联商品 →</Button>
              <Button onClick={() => navigate('tasks')}>任务与发布记录 →</Button>
            </div>
          </>
        )}
        {!site && <p className="muted">输入站点 ID 加载详情。</p>}
      </Card>
    </div>
  )
}
