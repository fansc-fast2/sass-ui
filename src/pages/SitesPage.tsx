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
import { useLang } from '../i18n'
import type { MsgKey, TFunc } from '../i18n'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'err' | 'neutral'> = {
  active: 'ok',
  read_only: 'warn',
  disconnected: 'err',
  suspended: 'err',
}

const SITE_STATUS_KEYS: Record<string, MsgKey> = {
  active: 'siteStatusActive',
  read_only: 'siteStatusReadOnly',
  disconnected: 'siteStatusDisconnected',
  suspended: 'siteStatusSuspended',
}

function siteStatusSemantic(status: string, t: TFunc): StatusSemantic {
  const label = SITE_STATUS_KEYS[status] ? t(SITE_STATUS_KEYS[status]) : status
  return {
    label,
    detail: t('siteStatusDetail', { label }),
    tone: STATUS_TONES[status] ?? 'neutral',
    shape: 'dot',
    icon: <IconGlobe size={11} />,
  }
}

export function SitesPage() {
  const { t } = useLang()
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
      header: t('thSite'),
      render: (s) => (<><span className="cell-strong">{s.name}</span> <MonoText>{s.id}</MonoText></>),
      sortValue: (s) => s.name,
    },
    {
      key: 'host',
      header: t('thHost'),
      render: (s) => <span className="muted">{s.public_host || '—'}</span>,
      sortValue: (s) => s.public_host ?? '',
      ellipsis: 200,
      titleOf: (s) => s.public_host ?? '',
    },
    {
      key: 'markets',
      header: t('thMarkets'),
      render: (s) => <span className="muted">{s.markets.join('/')} · {s.locales.join('/')}</span>,
      sortValue: (s) => s.markets.join('/'),
    },
    {
      key: 'status',
      header: t('thConnStatus'),
      render: (s) => <StatusBadge semantic={siteStatusSemantic(s.status, t)} />,
      sortValue: (s) => s.status,
    },
    {
      key: 'last_synced_at',
      header: t('thLastSync'),
      render: (s) => <span className="muted"><RelativeTime value={s.last_synced_at} /></span>,
      sortValue: (s) => s.last_synced_at ?? '',
    },
    {
      key: 'actions',
      header: '',
      render: (s) => <Button className="btn-xs" onClick={() => navigate('site-detail', s.id)}>{t('detail')}</Button>,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card title={t('sitesTitle')} subtitle={t('sitesSub')}>
        <div className="row gap">
          <Button variant="primary" disabled={loading} onClick={() => void query()}>{loading ? t('querying') : t('btnQuerySites')}</Button>
        </div>
        <DataTable
          columns={columns}
          rows={sites}
          getRowKey={(s) => s.id}
          onRowClick={(s) => navigate('site-detail', s.id)}
          empty={loaded ? t('sitesEmptyLoaded') : t('sitesEmptyInitial')}
          emptyHint={loaded ? t('sitesEmptyHint') : undefined}
          emptyAction={loaded ? <Button variant="primary" onClick={focusDirectOpen}>{t('btnOpenBySiteId')}</Button> : undefined}
          footerExtra={null}
        />
      </Card>

      <Card title={t('sitesDirectTitle')} subtitle={t('sitesDirectSub')}>
        <div className="row gap">
          <TextInput
            ref={directInputRef}
            value={directId}
            onChange={(e) => setDirectId(e.target.value)}
            placeholder="site-us"
            style={{ width: 220 }}
          />
          <Button variant="primary" disabled={!directId.trim()} onClick={() => navigate('site-detail', directId.trim())}>{t('btnOpenDetail')}</Button>
        </div>
      </Card>
    </div>
  )
}

export function SiteDetailPage() {
  const { t } = useLang()
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
        title={t('pageSiteDetail')}
        subtitle={t('siteDetailSub')}
        actions={<Button variant="ghost" onClick={() => navigate('sites')}>
          <span className="btn-icon-text"><IconChevronLeft size={13} /> {t('backToSites')}</span>
        </Button>}
      >
        <div className="row gap">
          <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="site_id" style={{ maxWidth: 260 }} />
          <Button
            disabled={loading || !id.trim()}
            onClick={() => navigate('site-detail', id.trim())}
          >
            {loading ? t('loading') : t('btnLoad')}
          </Button>
        </div>
        {site && (
          <>
            <div className="result-col">
              <ResultRow label={t('thSite')}><strong>{site.name}</strong> <MonoText>{site.id}</MonoText></ResultRow>
              <ResultRow label={t('thHost')}>{site.public_host || '—'}</ResultRow>
              <ResultRow label={t('thMarkets')}>{site.markets.join('/')} · {site.locales.join('/')}</ResultRow>
              <ResultRow label={t('thConnStatus')}><StatusBadge semantic={siteStatusSemantic(site.status, t)} /></ResultRow>
              <ResultRow label={t('thLastSync')}>{site.last_synced_at ? <RelativeTime value={site.last_synced_at} /> : t('notSynced')}</ResultRow>
            </div>
            <div className="row gap wrap">
              {site.connection_ids.length === 0 && <span className="muted">{t('noConnRefs')}</span>}
              {site.connection_ids.map((c) => (
                <Button key={c} onClick={() => void loadCaps(c)}>{t('btnQueryCaps', { conn: c })}</Button>
              ))}
            </div>
            {caps && <JsonView value={caps} label={t('capsJsonLabel')} />}
            <div className="row gap">
              <Button onClick={() => navigate('products')}>
                <span className="btn-icon-text">{t('btnLinkedProducts')} <IconArrowRight size={13} /></span>
              </Button>
              <Button onClick={() => navigate('tasks')}>
                <span className="btn-icon-text">{t('btnJobsAndPublishes')} <IconArrowRight size={13} /></span>
              </Button>
            </div>
          </>
        )}
        {!site && <p className="muted">{t('siteNeedIdHint')}</p>}
      </Card>
    </div>
  )
}
