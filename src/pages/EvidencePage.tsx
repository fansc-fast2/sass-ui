// 资料与证据（P03，/evidence）：只读索引——来源类型、适用商品、来源版本、
// 验证状态与公开使用资格。证据详情按权限决定能否显示摘录（19 §4 P03）。

import { useState } from 'react'
import { getEvidence, listEvidence } from '../api/api'
import type { EvidenceDetail } from '../api/types'
import { Badge, Button, Card, ErrorBanner, MonoText, ResultRow, TextInput } from '../components/ui'
import { DataTable } from '../components/DataTable'
import type { Column } from '../components/DataTable'
import { FullTime } from '../components/RelativeTime'
import { useLang } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useApiOperation } from '../state/useApiOperation'

export function EvidencePage() {
  const { t } = useLang()
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
      header: t('thEvidence'),
      render: (ev) => <MonoText>{ev.id}</MonoText>,
      sortValue: (ev) => ev.id,
      ellipsis: 200,
      titleOf: (ev) => ev.id,
    },
    {
      key: 'product_id',
      header: t('thApplicableProducts'),
      render: (ev) => <MonoText>{ev.product_id}</MonoText>,
      sortValue: (ev) => ev.product_id,
    },
    { key: 'source_version', header: t('thSourceVersion'), render: (ev) => ev.source_version, sortValue: (ev) => ev.source_version },
    { key: 'access', header: t('thAccessLevel'), render: (ev) => <Badge tone="neutral">{ev.access}</Badge>, sortValue: (ev) => ev.access },
    {
      key: 'public_disclosure',
      header: t('thPublicUse'),
      render: (ev) => <Badge tone={ev.public_disclosure === 'approved' ? 'ok' : 'warn'}>{ev.public_disclosure}</Badge>,
      sortValue: (ev) => ev.public_disclosure,
    },
    {
      key: 'actions',
      header: '',
      render: (ev) => <Button className="btn-xs" onClick={() => void open(ev.id)}>{t('detail')}</Button>,
    },
  ]

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card
        title={t('evidenceTitle')}
        subtitle={t('evidenceSub')}
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>{t('labelProduct')}</span>
            <TextInput value={productId} onChange={(e) => setProductId(e.target.value)} style={{ width: 160 }} placeholder="prod-001" />
          </label>
          <Button variant="primary" disabled={!canRead || loading} onClick={() => void query()}>
            {loading ? t('querying') : t('query')}
          </Button>
        </div>
        {!canRead && <p className="muted">{t('noPermRead')}</p>}
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(ev) => ev.id}
          initialSortKey="product_id"
          empty={loaded ? t('evidenceEmptyLoaded') : t('evidenceEmptyInitial')}
          footerExtra={nextCursor ? <Button className="btn-xs" disabled={loading} onClick={() => void query(nextCursor)}>{t('loadNextPage')}</Button> : null}
        />
      </Card>

      {selected && (
        <Card title={t('evidenceDetailTitle')} subtitle={t('evidenceDetailSub')}>
          <div className="result-col">
            <ResultRow label={t('thEvidenceId')}><MonoText>{selected.id}</MonoText></ResultRow>
            <ResultRow label={t('thSourceVersion')}>{selected.source_version}</ResultRow>
            <ResultRow label={t('labelVisibility')}>
              <Badge tone={selected.visibility === 'content' ? 'ok' : 'warn'}>
                {selected.visibility === 'content' ? t('visContent') : t('visMetadataOnly')}
              </Badge>
            </ResultRow>
            <ResultRow label={t('labelSourceHash')}>
              {selected.source_hash ? <MonoText>{selected.source_hash.slice(0, 24)}…</MonoText> : <span className="muted">{t('noHashInMetadata')}</span>}
            </ResultRow>
            <ResultRow label={t('labelObservedAt')}><FullTime value={selected.observed_at} fallback={selected.observed_at} /></ResultRow>
            <ResultRow label={t('thExcerpt')}>
              {selected.can_view_excerpt && selected.excerpt
                ? <span>{selected.excerpt}</span>
                : <span className="muted">{t('noExcerptPermReason', { access: selected.access })}</span>}
            </ResultRow>
          </div>
        </Card>
      )}
    </div>
  )
}
