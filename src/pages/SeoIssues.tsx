// SEO 检查：审计产出的问题清单——筛选、翻页，以及两种处理动作（豁免 / 核验事实）。

import { useState } from 'react'
import { dismissIssue, listIssues, verifyFact } from '../api/api'
import type { IssueList } from '../api/types'
import { toast } from '../components/Toast'
import { useLang } from '../i18n'
import type { MsgKey } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useApiOperation } from '../state/useApiOperation'
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, JsonView, MonoText, ResultRow, Select, TextArea, TextInput,
} from '../components/ui'

const ISSUE_STATUSES = ['open', 'proposed', 'resolved', 'dismissed'] as const
const STATUS_KEYS: Record<string, MsgKey> = {
  open: 'issOpen',
  proposed: 'issProposed',
  resolved: 'issResolved',
  dismissed: 'issDismissed',
}

export function SeoIssues() {
  const { t } = useLang()
  const { hasScope } = useSession()
  const { loading, error, run } = useApiOperation()

  const [statusFilter, setStatusFilter] = useState('')
  const [limit, setLimit] = useState('20')
  const [cursor, setCursor] = useState('')
  const [issues, setIssues] = useState<IssueList | null>(null)

  const [dismissId, setDismissId] = useState('')
  const [dismissReason, setDismissReason] = useState(() => t('defaultDismissReason'))
  const [dismissVersion, setDismissVersion] = useState('1')
  const [verifyFactId, setVerifyFactId] = useState('')
  const [verifyNote, setVerifyNote] = useState(() => t('defaultVerifyNote'))
  const [verifyPublic, setVerifyPublic] = useState(true)
  const [actionResult, setActionResult] = useState<string | null>(null)

  const canRead = hasScope('knowledge.read')
  const canVerify = hasScope('knowledge.verify')

  const queryIssues = async (useCursor?: string) => {
    const res = await run('GET', '/v1/issues', () =>
      listIssues({
        status: statusFilter || undefined,
        limit: limit ? Number(limit) : undefined,
        cursor: useCursor || undefined,
      }))
    if (res) {
      setIssues(res.data)
      setCursor(res.data.next_cursor ?? '')
    }
  }

  const submitDismiss = async () => {
    if (!dismissId.trim()) return
    const version = Number(dismissVersion)
    const res = await run('POST', `/v1/issues/${dismissId.trim()}/dismiss`, () =>
      dismissIssue(dismissId.trim(), {
        reason: dismissReason,
        expected_version: Number.isFinite(version) ? version : 0,
      }))
    if (res) {
      setActionResult(t('issueDismissedMsg', { id: res.data.id, status: res.data.status }))
      toast.ok(t('issueDismissedMsg', { id: res.data.id, status: res.data.status }))
    }
  }

  const submitVerify = async () => {
    if (!verifyFactId.trim()) return
    const res = await run('POST', `/v1/facts/${verifyFactId.trim()}/verify`, () =>
      verifyFact(verifyFactId.trim(), { public_use: verifyPublic, note: verifyNote }))
    if (res) {
      setActionResult(t('factVerifiedMsg', { id: res.data.id, status: res.data.status }))
      toast.ok(t('factVerifiedMsg', { id: res.data.id, status: res.data.status }))
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      {actionResult && <p className="flow-result"><Badge tone="ok">{t('done')}</Badge> {actionResult}</p>}

      <Card
        title={t('issuesListTitle')}
        subtitle={t('issuesListSub')}
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>{t('filterStatus')}</span>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160 }}>
              <option value="">{t('optAllStatus')}</option>
              {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s} · {t(STATUS_KEYS[s])}</option>)}
            </Select>
          </label>
          <label className="inline-field">
            <span>{t('filterPageSize')}</span>
            <TextInput value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 90 }} />
          </label>
          <Button variant="primary" disabled={!canRead || loading} onClick={() => void queryIssues()}>
            {loading ? t('querying') : t('btnRefreshList')}
          </Button>
          {cursor && (
            <Button disabled={!canRead || loading} onClick={() => void queryIssues(cursor)}>{t('next')}</Button>
          )}
        </div>
        {!canRead && <p className="muted">{t('noPermRead')}</p>}
        {issues && (
          <>
            <ResultRow label={t('labelPageCount')}><Badge tone="neutral">{t('pageStatBadge', { count: issues.items.length, limit: issues.limit })}</Badge></ResultRow>
            <ResultRow label={t('labelCursor')}>
              {issues.next_cursor ? <MonoText>{issues.next_cursor.slice(0, 48)}…</MonoText> : <span className="muted">{t('noMoreCursor')}</span>}
            </ResultRow>
            {issues.items.length === 0
              ? <EmptyState text={t('issuesEmpty')} />
              : <JsonView value={issues.items} label={t('issuesJsonLabel')} />}
          </>
        )}
      </Card>

      <div className="grid-2 cards">
        <Card title={t('dismissCardTitle')} subtitle={t('dismissCardSub')}>
          <div className="col gap">
            <Field label={t('fieldIssueId')}>
              <TextInput value={dismissId} onChange={(e) => setDismissId(e.target.value)} placeholder="issue-001" />
            </Field>
            <Field label={t('fieldVersion')} hint={t('hintVersion')}>
              <TextInput value={dismissVersion} onChange={(e) => setDismissVersion(e.target.value)} />
            </Field>
            <Field label={t('fieldDismissReason')}>
              <TextArea rows={2} value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} />
            </Field>
            <Button variant="primary" disabled={!canVerify || loading || !dismissId.trim()} onClick={() => void submitDismiss()}>
              {t('btnSubmitDismiss')}
            </Button>
            {!canVerify && <p className="muted">{t('noPermVerify')}</p>}
          </div>
        </Card>

        <Card title={t('verifyCardTitle')} subtitle={t('verifyCardSub')}>
          <div className="col gap">
            <Field label={t('fieldFactId')}>
              <TextInput value={verifyFactId} onChange={(e) => setVerifyFactId(e.target.value)} placeholder="fact-001" />
            </Field>
            <Field label={t('fieldVerifyNote')}>
              <TextArea rows={2} value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={verifyPublic} onChange={(e) => setVerifyPublic(e.target.checked)} />
              <span>{t('checkPublicUse')}</span>
            </label>
            <Button variant="primary" disabled={!canVerify || loading || !verifyFactId.trim()} onClick={() => void submitVerify()}>
              {t('btnSubmitVerify')}
            </Button>
            {!canVerify && <p className="muted">{t('noPermVerify')}</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
