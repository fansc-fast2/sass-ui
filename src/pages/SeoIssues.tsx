// SEO 检查：审计产出的问题清单——筛选、翻页，以及两种处理动作（豁免 / 核验事实）。

import { useState } from 'react'
import { dismissIssue, listIssues, verifyFact } from '../api/api'
import type { IssueList } from '../api/types'
import { toast } from '../components/Toast'
import { useSession } from '../session/SessionContext'
import { useApiOperation } from '../state/useApiOperation'
import {
  Badge, Button, Card, EmptyState, ErrorBanner, Field, JsonView, MonoText, ResultRow, Select, TextArea, TextInput,
} from '../components/ui'

const ISSUE_STATUSES = ['open', 'proposed', 'resolved', 'dismissed'] as const
const STATUS_LABELS: Record<string, string> = {
  open: '待处理',
  proposed: '已提案',
  resolved: '已解决',
  dismissed: '已豁免',
}

export function SeoIssues() {
  const { hasScope } = useSession()
  const { loading, error, run } = useApiOperation()

  const [statusFilter, setStatusFilter] = useState('')
  const [limit, setLimit] = useState('20')
  const [cursor, setCursor] = useState('')
  const [issues, setIssues] = useState<IssueList | null>(null)

  const [dismissId, setDismissId] = useState('')
  const [dismissReason, setDismissReason] = useState('证据不足，人工确认误报')
  const [dismissVersion, setDismissVersion] = useState('1')
  const [verifyFactId, setVerifyFactId] = useState('')
  const [verifyNote, setVerifyNote] = useState('与源数据核对一致')
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
      setActionResult(`问题 ${res.data.id} 已豁免（${res.data.status}）`)
      toast.ok(`问题 ${res.data.id} 已豁免（${res.data.status}）`)
    }
  }

  const submitVerify = async () => {
    if (!verifyFactId.trim()) return
    const res = await run('POST', `/v1/facts/${verifyFactId.trim()}/verify`, () =>
      verifyFact(verifyFactId.trim(), { public_use: verifyPublic, note: verifyNote }))
    if (res) {
      setActionResult(`事实 ${res.data.id} 核验完成（${res.data.status}）`)
      toast.ok(`事实 ${res.data.id} 核验完成（${res.data.status}）`)
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      {actionResult && <p className="flow-result"><Badge tone="ok">完成</Badge> {actionResult}</p>}

      <Card
        title="问题清单"
        subtitle="SEO 审计发现的问题都会汇总在这里；先按状态筛选，再逐条处理"
      >
        <div className="row gap wrap">
          <label className="inline-field">
            <span>状态</span>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 160 }}>
              <option value="">（全部状态）</option>
              {ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s} · {STATUS_LABELS[s]}</option>)}
            </Select>
          </label>
          <label className="inline-field">
            <span>每页条数</span>
            <TextInput value={limit} onChange={(e) => setLimit(e.target.value)} style={{ width: 90 }} />
          </label>
          <Button variant="primary" disabled={!canRead || loading} onClick={() => void queryIssues()}>
            {loading ? '查询中…' : '刷新清单'}
          </Button>
          {cursor && (
            <Button disabled={!canRead || loading} onClick={() => void queryIssues(cursor)}>下一页</Button>
          )}
        </div>
        {!canRead && <p className="muted">当前角色缺少 knowledge.read 权限。</p>}
        {issues && (
          <>
            <ResultRow label="本页条数"><Badge tone="neutral">{issues.items.length} 条 · limit {issues.limit}</Badge></ResultRow>
            <ResultRow label="翻页游标">
              {issues.next_cursor ? <MonoText>{issues.next_cursor.slice(0, 48)}…</MonoText> : <span className="muted">（没有更多了）</span>}
            </ResultRow>
            {issues.items.length === 0
              ? <EmptyState text="清单是空的：要么还没有审计发现问题，要么当前筛选下没有数据（问题域数据接入后自动展示）" />
              : <JsonView value={issues.items} label="问题列表" />}
          </>
        )}
      </Card>

      <div className="grid-2 cards">
        <Card title="豁免误报" subtitle="确认某条问题是误报并记录理由（knowledge.verify，乐观版本校验）">
          <div className="col gap">
            <Field label="问题 ID">
              <TextInput value={dismissId} onChange={(e) => setDismissId(e.target.value)} placeholder="issue-001" />
            </Field>
            <Field label="版本号" hint="与服务端当前版本一致才生效">
              <TextInput value={dismissVersion} onChange={(e) => setDismissVersion(e.target.value)} />
            </Field>
            <Field label="豁免理由">
              <TextArea rows={2} value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} />
            </Field>
            <Button variant="primary" disabled={!canVerify || loading || !dismissId.trim()} onClick={() => void submitDismiss()}>
              提交豁免
            </Button>
            {!canVerify && <p className="muted">需要 knowledge_reviewer 及以上角色。</p>}
          </div>
        </Card>

        <Card title="核验事实" subtitle="人工核对后标记知识事实是否可公开使用（knowledge.verify）">
          <div className="col gap">
            <Field label="事实 ID">
              <TextInput value={verifyFactId} onChange={(e) => setVerifyFactId(e.target.value)} placeholder="fact-001" />
            </Field>
            <Field label="核验备注">
              <TextArea rows={2} value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={verifyPublic} onChange={(e) => setVerifyPublic(e.target.checked)} />
              <span>允许公开使用（public_use）</span>
            </label>
            <Button variant="primary" disabled={!canVerify || loading || !verifyFactId.trim()} onClick={() => void submitVerify()}>
              提交核验
            </Button>
            {!canVerify && <p className="muted">需要 knowledge_reviewer 及以上角色。</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
