// 站点与渠道（P04，/sites 与 /sites/:id）：站点列表与详情。
// 连接配置在设置管理，本页只展示状态并链接过去，不形成两套配置（19 §4）。

import { useEffect, useRef, useState } from 'react'
import { getCapabilities, getSite, listSites } from '../api/api'
import type { Capabilities, SiteSummary } from '../api/types'
import { Button, Card, ErrorBanner, JsonView, MonoText, ResultRow, TextInput } from '../components/ui'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { RelativeTime } from '../components/RelativeTime'
import { StatusBadge } from '../components/StatusBadge'
import type { StatusSemantic } from '../components/StatusBadge'
import { IconArrowRight, IconChevronLeft, IconGlobe } from '../components/icons'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  active: 'ok',
  read_only: 'warn',
  disconnected: 'err',
  suspended: 'err',
}

const SITE_STATUS_LABELS: Record<string, string> = {
  active: '正常',
  read_only: '只读',
  disconnected: '已断开',
  suspended: '已停用',
}

function siteStatusSemantic(status: string): StatusSemantic {
  return {
    label: SITE_STATUS_LABELS[status] ?? status,
    detail: `连接状态：${SITE_STATUS_LABELS[status] ?? status}`,
    tone: STATUS_TONES[status] ?? 'neutral',
    shape: 'dot',
    icon: <IconGlobe size={11} />,
  }
}

export function SitesPage() {
  const { navigate, focusId, clearFocusId } = useAppState()
  const { loading, error, run } = useApiOperation()
  const [sites, setSites] = useState<SiteSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [directId, setDirectId] = useState('')
  const directInputRef = useRef<HTMLInputElement | null>(null)

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

  const focusDirectOpen = () => {
    directInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    directInputRef.current?.focus()
  }

  const columns: Column<SiteSummary>[] = [
    {
      key: 'name',
      header: '站点',
      render: (s) => (<><span className="cell-strong">{s.name}</span> <MonoText>{s.id}</MonoText></>),
      sortValue: (s) => s.name,
    },
    {
      key: 'host',
      header: '域名',
      render: (s) => <span className="muted">{s.public_host || '—'}</span>,
      sortValue: (s) => s.public_host ?? '',
      ellipsis: 200,
      titleOf: (s) => s.public_host ?? '',
    },
    {
      key: 'markets',
      header: '市场 / 语言',
      render: (s) => <span className="muted">{s.markets.join('/')} · {s.locales.join('/')}</span>,
      sortValue: (s) => s.markets.join('/'),
    },
    {
      key: 'status',
      header: '连接状态',
      render: (s) => <StatusBadge semantic={siteStatusSemantic(s.status)} />,
      sortValue: (s) => s.status,
    },
    {
      key: 'last_synced_at',
      header: '最近同步',
      render: (s) => <span className="muted"><RelativeTime value={s.last_synced_at} /></span>,
      sortValue: (s) => s.last_synced_at ?? '',
    },
    {
      key: 'actions',
      header: '',
      render: (s) => <Button className="btn-xs" onClick={() => navigate('site-detail', s.id)}>详情</Button>,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card title="站点列表" subtitle="GET /v1/sites · 可见站点集合；站点是页面筛选范围，租户是安全边界（19 §2）">
        <div className="row gap">
          <Button variant="primary" disabled={loading} onClick={() => void query()}>{loading ? '查询中…' : '查询站点'}</Button>
        </div>
        <DataTable
          columns={columns}
          rows={sites}
          getRowKey={(s) => s.id}
          onRowClick={(s) => navigate('site-detail', s.id)}
          empty={loaded ? '还没有可见站点——站点引用由控制层/连接注册同步（骨架阶段为空）' : '点击「查询站点」加载可见站点'}
          emptyHint={loaded ? '也可以先用站点 ID 直接进入详情页' : undefined}
          emptyAction={loaded ? <Button variant="primary" onClick={focusDirectOpen}>用站点 ID 直接打开</Button> : undefined}
          footerExtra={null}
        />
      </Card>

      <Card title="直接打开站点" subtitle="站点数据接入前，可用站点 ID 直接进入详情页">
        <div className="row gap">
          <TextInput
            ref={directInputRef}
            value={directId}
            onChange={(e) => setDirectId(e.target.value)}
            placeholder="site-us"
            style={{ width: 220 }}
          />
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
        actions={<Button variant="ghost" onClick={() => navigate('sites')}>
          <span className="btn-icon-text"><IconChevronLeft size={13} /> 返回站点</span>
        </Button>}
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
              <ResultRow label="连接状态"><StatusBadge semantic={siteStatusSemantic(site.status)} /></ResultRow>
              <ResultRow label="最近同步">{site.last_synced_at ? <RelativeTime value={site.last_synced_at} /> : '未同步'}</ResultRow>
            </div>
            <div className="row gap wrap">
              {site.connection_ids.length === 0 && <span className="muted">（骨架阶段无连接引用，可手动查询连接能力）</span>}
              {site.connection_ids.map((c) => (
                <Button key={c} onClick={() => void loadCaps(c)}>查询 {c} 能力</Button>
              ))}
            </div>
            {caps && <JsonView value={caps} label="连接能力" />}
            <div className="row gap">
              <Button onClick={() => navigate('products')}>
                <span className="btn-icon-text">关联商品 <IconArrowRight size={13} /></span>
              </Button>
              <Button onClick={() => navigate('tasks')}>
                <span className="btn-icon-text">任务与发布记录 <IconArrowRight size={13} /></span>
              </Button>
            </div>
          </>
        )}
        {!site && <p className="muted">输入站点 ID 加载详情。</p>}
      </Card>
    </div>
  )
}
