// 优化提案向导：① 起草提案 → ② 评审与授权 → ③ 执行与结果。
// 授权必须回显服务端 GET 返回的 content_hash（07 §4），confirmation_id 由前端生成。
// 字段白名单：seo.title / seo.description / image.alt。
// 提案列表只展示当前租户的记录（租户隔离视图）。

import { useEffect, useState } from 'react'
import { authorizeChangeSet, createChangeSet, executeChangeSet, getChangeSet, revokeChangeSet } from '../api/api'
import type { ChangeEntry, ChangeSetCreated, ChangeSetView, ExecutionAccepted } from '../api/types'
import { idempotencyKey } from '../api/client'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'
import {
  Badge, Button, Card, ErrorBanner, Field, JsonView, MonoText, ResultRow, Select, Steps, TextArea, TextInput,
} from '../components/ui'

const FIELD_WHITELIST = ['seo.title', 'seo.description', 'image.alt'] as const
const STEP_LABELS = ['起草提案', '评审与授权', '执行与结果']

interface DraftEdit {
  fieldPath: string
  proposedValue: string
  assetId: string
  factRefsRaw: string
}

interface DraftEntry {
  productId: string
  connectionId: string
  siteId: string
  locale: string
  market: string
  variantId: string
  edits: DraftEdit[]
}

function emptyEntry(productId = 'prod-001'): DraftEntry {
  return {
    productId,
    connectionId: 'cms-main',
    siteId: 'site-us',
    locale: 'en-US',
    market: 'US',
    variantId: '',
    edits: [{ fieldPath: 'seo.title', proposedValue: '', assetId: '', factRefsRaw: '' }],
  }
}

function parseFactRefs(raw: string): { refs: { id: string; version: number }[] } | { err: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { refs: [] }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) return { err: 'fact_refs 必须是 JSON 数组' }
    const refs: { id: string; version: number }[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) return { err: 'fact_refs 元素必须是对象' }
      const rec = item as Record<string, unknown>
      if (typeof rec.id !== 'string' || typeof rec.version !== 'number' || !Number.isInteger(rec.version)) {
        return { err: 'fact_refs 元素需要字符串 id 与整数 version' }
      }
      refs.push({ id: rec.id, version: rec.version })
    }
    return { refs }
  } catch {
    return { err: 'fact_refs 不是合法 JSON' }
  }
}

export function Proposals() {
  const { hasScope } = useSession()
  const { tenantChangeSets, upsertChangeSet, attachAuthorization, addExecution, navigate, focusId, clearFocusId } = useAppState()
  const { loading, error, run } = useApiOperation()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [entries, setEntries] = useState<DraftEntry[]>([emptyEntry()])
  const [created, setCreated] = useState<ChangeSetCreated | null>(null)

  const [viewId, setViewId] = useState('')
  const [view, setView] = useState<ChangeSetView | null>(null)
  const [proposalVersion, setProposalVersion] = useState('1')
  const [authReason, setAuthReason] = useState('评审通过，授权执行')
  const [execAuthId, setExecAuthId] = useState('')
  const [execResult, setExecResult] = useState<ExecutionAccepted | null>(null)
  const [revokeReason, setRevokeReason] = useState('提案作废')
  const [flowResult, setFlowResult] = useState<string | null>(null)

  // 从商品详情带过来的焦点商品：预填第一条草稿
  useEffect(() => {
    if (focusId) {
      setEntries((prev) => prev.map((e, i) => (i === 0 ? { ...e, productId: focusId } : e)))
      setStep(1)
      clearFocusId()
    }
  }, [focusId, clearFocusId])

  const canRead = hasScope('change.read')
  const canPropose = hasScope('change.propose')
  const canAuthorize = hasScope('change.authorize')
  const canExecute = hasScope('change.execute')

  const patchEntry = (idx: number, patch: Partial<DraftEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }
  const patchEdit = (idx: number, eidx: number, patch: Partial<DraftEdit>) => {
    setEntries((prev) => prev.map((e, i) => {
      if (i !== idx) return e
      return { ...e, edits: e.edits.map((ed, j) => (j === eidx ? { ...ed, ...patch } : ed)) }
    }))
  }

  const validateDraft = (): { body: ChangeEntry[] } | { err: string } => {
    const body: ChangeEntry[] = []
    for (const [i, entry] of entries.entries()) {
      if (!entry.productId.trim() || !entry.connectionId.trim() || !entry.siteId.trim()
        || !entry.locale.trim() || !entry.market.trim()) {
        return { err: `条目 ${i + 1}：product_id / connection_id / site_id / locale / market 均必填` }
      }
      if (entry.edits.length === 0) return { err: `条目 ${i + 1}：至少一条编辑` }
      const edits = []
      for (const [j, edit] of entry.edits.entries()) {
        if (!edit.proposedValue) return { err: `条目 ${i + 1} 编辑 ${j + 1}：优化值不能为空` }
        const refs = parseFactRefs(edit.factRefsRaw)
        if ('err' in refs) return { err: `条目 ${i + 1} 编辑 ${j + 1}：${refs.err}` }
        edits.push({
          field_path: edit.fieldPath,
          proposed_value: edit.proposedValue,
          ...(edit.assetId.trim() ? { asset_id: edit.assetId.trim() } : {}),
          fact_refs: refs.refs,
        })
      }
      body.push({
        product_id: entry.productId.trim(),
        target: {
          connection_id: entry.connectionId.trim(),
          site_id: entry.siteId.trim(),
          locale: entry.locale.trim(),
          market: entry.market.trim(),
          ...(entry.variantId.trim() ? { variant_id: entry.variantId.trim() } : {}),
        },
        edits,
      })
    }
    return { body }
  }

  const submitDraft = async () => {
    const v = validateDraft()
    if ('err' in v) {
      setFlowResult(v.err)
      return
    }
    const res = await run('POST', '/v1/change-sets', () => createChangeSet(v.body))
    if (res) {
      setCreated(res.data)
      upsertChangeSet(res.data)
      setViewId(res.data.id)
      setProposalVersion(String(res.data.proposal_version))
      setFlowResult(null)
      setStep(2)
    }
  }

  const querySet = async (id?: string) => {
    const target = (id ?? viewId).trim()
    if (!target) return
    const res = await run('GET', `/v1/change-sets/${target}`, () => getChangeSet(target))
    if (res) {
      setView(res.data)
      setViewId(res.data.id)
    }
  }

  const loadFromList = async (id: string, record?: { authorizationId?: string; proposalVersion?: number }) => {
    setViewId(id)
    if (record?.authorizationId) setExecAuthId(record.authorizationId)
    if (record?.proposalVersion) setProposalVersion(String(record.proposalVersion))
    setStep(2)
    await querySet(id)
  }

  const submitAuthorize = async () => {
    const target = viewId.trim()
    if (!target) return
    // content_hash 必须来自服务端：优先用已查询的回包，否则先查询一次再授权。
    let hash = view?.id === target ? view?.content_hash : undefined
    if (!hash) {
      const got = await run('GET', `/v1/change-sets/${target}`, () => getChangeSet(target))
      if (!got) return
      setView(got.data)
      hash = got.data.content_hash
    }
    const version = Number(proposalVersion)
    const res = await run('POST', `/v1/change-sets/${target}/authorize`, () =>
      authorizeChangeSet(target, {
        content_hash: hash ?? '',
        expected_proposal_version: Number.isFinite(version) ? version : 0,
        confirmation_id: idempotencyKey(),
        reason: authReason,
      }))
    if (res) {
      attachAuthorization(target, res.data)
      setExecAuthId(res.data.authorization_id)
      setFlowResult(`授权成功（${res.data.grant_type}，24 小时内有效），可以进入下一步执行。`)
    }
  }

  const submitRevoke = async () => {
    const target = viewId.trim()
    if (!target) return
    const res = await run('POST', `/v1/change-sets/${target}/revoke`, () =>
      revokeChangeSet(target, { reason: revokeReason }))
    if (res) {
      setFlowResult(`提案已撤销（${res.data.status}）。如需重新优化，回到第一步重新起草。`)
      upsertChangeSet({ id: res.data.id, status: res.data.status })
    }
  }

  const submitExecute = async () => {
    const target = viewId.trim()
    if (!target || !execAuthId.trim()) return
    const res = await run('POST', `/v1/change-sets/${target}/execute`, () =>
      executeChangeSet(target, { authorization_id: execAuthId.trim() }))
    if (res) {
      addExecution({ executionId: res.data.execution_id, jobId: res.data.job_id, status: res.data.status })
      setExecResult(res.data)
      setFlowResult(null)
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card title="优化提案向导" subtitle="把知识/审计结论落到商品字段：起草 → 评审授权 → 执行发布">
        <Steps current={step} labels={STEP_LABELS} />
        {flowResult && <p className="flow-result"><Badge tone="info">提示</Badge> {flowResult}</p>}

        {step === 1 && (
          <>
            {entries.map((entry, idx) => (
              <div className="entry-block" key={idx}>
                <header className="entry-head">
                  <strong>商品 {idx + 1}</strong>
                  {entries.length > 1 && (
                    <Button variant="ghost" onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}>移除</Button>
                  )}
                </header>
                <div className="grid-3">
                  <Field label="product_id">
                    <TextInput value={entry.productId} onChange={(e) => patchEntry(idx, { productId: e.target.value })} />
                  </Field>
                  <Field label="connection_id">
                    <TextInput value={entry.connectionId} onChange={(e) => patchEntry(idx, { connectionId: e.target.value })} />
                  </Field>
                  <Field label="site_id">
                    <TextInput value={entry.siteId} onChange={(e) => patchEntry(idx, { siteId: e.target.value })} />
                  </Field>
                  <Field label="locale">
                    <TextInput value={entry.locale} onChange={(e) => patchEntry(idx, { locale: e.target.value })} />
                  </Field>
                  <Field label="market">
                    <TextInput value={entry.market} onChange={(e) => patchEntry(idx, { market: e.target.value })} />
                  </Field>
                  <Field label="variant_id" hint="可选">
                    <TextInput value={entry.variantId} onChange={(e) => patchEntry(idx, { variantId: e.target.value })} />
                  </Field>
                </div>
                {entry.edits.map((edit, eidx) => (
                  <div className="edit-block" key={eidx}>
                    <header className="entry-head">
                      <span className="muted">字段修改 {eidx + 1}</span>
                      {entry.edits.length > 1 && (
                        <Button variant="ghost" onClick={() => setEntries((prev) => prev.map((e, i) => (
                          i === idx ? { ...e, edits: e.edits.filter((_, j) => j !== eidx) } : e
                        )))}>移除</Button>
                      )}
                    </header>
                    <div className="grid-3">
                      <Field label="目标字段" hint="白名单">
                        <Select value={edit.fieldPath} onChange={(e) => patchEdit(idx, eidx, { fieldPath: e.target.value })}>
                          {FIELD_WHITELIST.map((f) => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </Field>
                      <Field label="asset_id" hint="可选（图片类）">
                        <TextInput value={edit.assetId} onChange={(e) => patchEdit(idx, eidx, { assetId: e.target.value })} />
                      </Field>
                      <Field label="优化值">
                        <TextInput value={edit.proposedValue} onChange={(e) => patchEdit(idx, eidx, { proposedValue: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="依据事实 fact_refs" hint='可选，JSON 数组，如 [{"id":"fact-1","version":2}]'>
                      <TextArea rows={2} value={edit.factRefsRaw} onChange={(e) => patchEdit(idx, eidx, { factRefsRaw: e.target.value })} />
                    </Field>
                  </div>
                ))}
                <Button variant="ghost" onClick={() => setEntries((prev) => prev.map((e, i) => (
                  i === idx
                    ? { ...e, edits: [...e.edits, { fieldPath: 'seo.description', proposedValue: '', assetId: '', factRefsRaw: '' }] }
                    : e
                )))}>+ 再改一个字段</Button>
              </div>
            ))}
            <div className="row gap">
              <Button variant="ghost" onClick={() => setEntries((prev) => [...prev, emptyEntry()])}>+ 添加商品</Button>
              <Button variant="primary" disabled={!canPropose || loading} onClick={() => void submitDraft()}>
                {loading ? '提交中…' : '提交并送审'}
              </Button>
              {!canPropose && <p className="muted">当前角色缺少 change.propose 权限（analyst 及以上），只能查看。</p>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {created && (
              <div className="result-col">
                <ResultRow label="提案编号"><MonoText>{created.id}</MonoText></ResultRow>
                <ResultRow label="内容摘要 content_hash"><MonoText>{created.content_hash.slice(0, 32)}…</MonoText></ResultRow>
                <ResultRow label="版本 / 字段数"><Badge tone="neutral">v{created.proposal_version} · {created.item_count} 处修改</Badge></ResultRow>
              </div>
            )}
            <div className="row gap">
              <TextInput value={viewId} onChange={(e) => setViewId(e.target.value)} placeholder="也可输入已有提案编号继续处理" style={{ maxWidth: 360 }} />
              <Button disabled={!canRead || loading || !viewId.trim()} onClick={() => void querySet()}>刷新状态</Button>
              <Button variant="ghost" onClick={() => setStep(1)}>← 回到起草</Button>
            </div>
            {view && (
              <div className="result-col">
                <ResultRow label="当前状态"><Badge tone="info">{view.status}</Badge></ResultRow>
                <ResultRow label="content_hash（授权时回显）"><MonoText>{view.content_hash}</MonoText></ResultRow>
                <ResultRow label="哈希 schema">
                  {view.hash_schema_version
                    ? <Badge tone="info">v{view.hash_schema_version}{view.hash_schema_version >= 2 ? ' · 双基线' : ''}</Badge>
                    : <span className="muted">未声明</span>}
                </ResultRow>
                <ResultRow label="修改明细"><Badge tone="neutral">{view.items.length} 条</Badge></ResultRow>
                {view.items.length > 0 && <JsonView value={view.items} label="修改明细" />}
              </div>
            )}
            <div className="grid-2 cards inner">
              <div className="col gap">
                <strong>评审通过 → 授权</strong>
                <Field label="提案版本" hint="与服务端当前版本一致">
                  <TextInput value={proposalVersion} onChange={(e) => setProposalVersion(e.target.value)} />
                </Field>
                <Field label="授权理由">
                  <TextArea rows={2} value={authReason} onChange={(e) => setAuthReason(e.target.value)} />
                </Field>
                <Button variant="primary" disabled={!canAuthorize || loading || !viewId.trim()} onClick={() => void submitAuthorize()}>
                  确认授权（回显 content_hash）
                </Button>
                {!canAuthorize && <p className="muted">需要 publisher 角色授权。</p>}
              </div>
              <div className="col gap">
                <strong>作废提案</strong>
                <Field label="作废理由">
                  <TextInput value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
                </Field>
                <Button variant="danger" disabled={!canAuthorize || loading || !viewId.trim()} onClick={() => void submitRevoke()}>
                  撤销提案
                </Button>
                <Button variant="primary" disabled={!execAuthId.trim()} onClick={() => setStep(3)}>
                  下一步：执行 →
                </Button>
                {execAuthId
                  ? <p className="muted">已获得授权 <MonoText>{execAuthId}</MonoText></p>
                  : <p className="muted">授权成功后才能进入执行。</p>}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="col gap">
              <strong>执行发布</strong>
              <Field label="授权凭证 authorization_id" hint="评审授权后自动带入">
                <TextInput value={execAuthId} onChange={(e) => setExecAuthId(e.target.value)} />
              </Field>
              <div className="row gap">
                <Button variant="primary" disabled={!canExecute || loading || !viewId.trim() || !execAuthId.trim()} onClick={() => void submitExecute()}>
                  {loading ? '提交中…' : '确认执行'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>← 回到评审</Button>
                {!canExecute && <p className="muted">需要 publisher 角色执行。</p>}
              </div>
            </div>
          </>
        )}
      </Card>

      {step === 3 && execResult && (
        <Card title="执行已受理" subtitle="执行是异步的，状态变化在「执行记录」里跟踪">
          <div className="result-col">
            <ResultRow label="提案编号"><MonoText>{viewId}</MonoText></ResultRow>
            <ResultRow label="执行编号"><MonoText>{execResult.execution_id}</MonoText></ResultRow>
            <ResultRow label="任务编号"><MonoText>{execResult.job_id}</MonoText></ResultRow>
            <ResultRow label="当前状态"><Badge tone="info">{execResult.status}</Badge></ResultRow>
            <Button variant="primary" onClick={() => navigate('tasks')}>去执行记录跟踪 →</Button>
          </div>
        </Card>
      )}

      <Card title="提案列表" subtitle="当前租户在本会话创建或跟进过的提案；从这里可以继续未完成的流程">
        {tenantChangeSets.length === 0 ? (
          <p className="muted">暂无提案——在第一步起草并提交后出现在这里</p>
        ) : (
          <table className="table">
            <thead><tr><th>编号</th><th>状态</th><th>版本</th><th>授权凭证</th><th>创建时间</th><th></th></tr></thead>
            <tbody>
              {tenantChangeSets.map((c) => (
                <tr key={c.id}>
                  <td><MonoText>{c.id}</MonoText></td>
                  <td>{c.status ? <Badge tone="info">{c.status}</Badge> : '—'}</td>
                  <td>{c.proposalVersion ? `v${c.proposalVersion}` : '—'}</td>
                  <td>{c.authorizationId ? <MonoText>{c.authorizationId}</MonoText> : <span className="muted">未授权</span>}</td>
                  <td>{c.createdAt}</td>
                  <td>
                    <Button className="btn-xs" onClick={() => void loadFromList(c.id, c)}>继续处理</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
