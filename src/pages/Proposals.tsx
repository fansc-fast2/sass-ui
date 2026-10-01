// 优化提案向导：① 起草提案 → ② 评审与授权 → ③ 执行与结果。
// 授权必须回显服务端 GET 返回的 content_hash（07 §4），confirmation_id 由前端生成。
// 字段白名单：seo.title / seo.description / image.alt。
// 提案列表只展示当前租户的记录（租户隔离视图）。

import { useEffect, useState } from 'react'
import { authorizeChangeSet, createChangeSet, executeChangeSet, getChangeSet, revokeChangeSet } from '../api/api'
import { idempotencyScopeFor, stableIdempotencyKey } from '../api/idempotency'
import type { ChangeEntry, ChangeSetCreated, ChangeSetView, ExecutionAccepted } from '../api/types'
import { useLang } from '../i18n'
import type { MsgKey } from '../i18n'
import { useSession } from '../session/SessionContext'
import { useAppState } from '../state/AppStateContext'
import { useApiOperation } from '../state/useApiOperation'
import { StatusBadge } from '../components/StatusBadge'
import { toast } from '../components/Toast'
import {
  Badge, Button, Card, ErrorBanner, Field, JsonView, MonoText, ResultRow, Select, Steps, TextArea, TextInput,
} from '../components/ui'
import { IconArrowRight, IconChevronLeft } from '../components/icons'

const FIELD_WHITELIST = ['seo.title', 'seo.description', 'image.alt'] as const
const STEP_KEYS: MsgKey[] = ['stepDraft', 'stepReview', 'stepExecute']

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

/** fact_refs JSON 校验：返回 key（在调用处经 t() 翻译），避免在组件外取语言。 */
function parseFactRefs(raw: string): { refs: { id: string; version: number }[] } | { errKey: MsgKey } {
  const trimmed = raw.trim()
  if (!trimmed) return { refs: [] }
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) return { errKey: 'errFactRefsArray' }
    const refs: { id: string; version: number }[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) return { errKey: 'errFactRefsObject' }
      const rec = item as Record<string, unknown>
      if (typeof rec.id !== 'string' || typeof rec.version !== 'number' || !Number.isInteger(rec.version)) {
        return { errKey: 'errFactRefsFields' }
      }
      refs.push({ id: rec.id, version: rec.version })
    }
    return { refs }
  } catch {
    return { errKey: 'errFactRefsJson' }
  }
}

export function Proposals() {
  const { t } = useLang()
  const { hasScope } = useSession()
  const { tenantChangeSets, upsertChangeSet, attachAuthorization, addExecution, navigate, focusId, clearFocusId } = useAppState()
  const { loading, error, run } = useApiOperation()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [entries, setEntries] = useState<DraftEntry[]>([emptyEntry()])
  const [created, setCreated] = useState<ChangeSetCreated | null>(null)

  const [viewId, setViewId] = useState('')
  const [view, setView] = useState<ChangeSetView | null>(null)
  const [proposalVersion, setProposalVersion] = useState('1')
  const [authReason, setAuthReason] = useState(() => t('defaultAuthReason'))
  const [execAuthId, setExecAuthId] = useState('')
  const [execResult, setExecResult] = useState<ExecutionAccepted | null>(null)
  const [revokeReason, setRevokeReason] = useState(() => t('defaultRevokeReason'))
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
        return { err: t('draftErrMandatory', { n: i + 1 }) }
      }
      if (entry.edits.length === 0) return { err: t('draftErrNoEdits', { n: i + 1 }) }
      const edits = []
      for (const [j, edit] of entry.edits.entries()) {
        if (!edit.proposedValue) return { err: t('draftErrEmptyValue', { n: i + 1, m: j + 1 }) }
        const refs = parseFactRefs(edit.factRefsRaw)
        if ('errKey' in refs) return { err: t('draftErrFactRefs', { n: i + 1, m: j + 1, err: t(refs.errKey) }) }
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
    const res = await run('POST', '/v1/change-sets', () => createChangeSet(v.body, {
      // 10 §5：同内容重试（含页面刷新后）复用同一幂等键，不重复创建提案
      idempotencyScope: idempotencyScopeFor('cs-create', 'draft', v.body),
    }))
    if (res) {
      setCreated(res.data)
      upsertChangeSet(res.data)
      setViewId(res.data.id)
      setProposalVersion(String(res.data.proposal_version))
      setFlowResult(null)
      setStep(2)
      toast.ok(t('proposalCreatedToast', { id: res.data.id, v: res.data.proposal_version, count: res.data.item_count }))
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
    // confirmation_id 与 Idempotency-Key 同源（10 §5）：页面刷新后重试，
    // 两个值都保持不变，服务端据此去重，不会重复签发授权。
    const confirmKey = stableIdempotencyKey(idempotencyScopeFor('cs-authorize', target, { hash, version, reason: authReason }))
    const res = await run('POST', `/v1/change-sets/${target}/authorize`, () =>
      authorizeChangeSet(target, {
        content_hash: hash ?? '',
        expected_proposal_version: Number.isFinite(version) ? version : 0,
        confirmation_id: confirmKey,
        reason: authReason,
      }, { idempotencyScope: idempotencyScopeFor('cs-authorize-key', target, { hash, version, reason: authReason }) }))
    if (res) {
      attachAuthorization(target, res.data)
      setExecAuthId(res.data.authorization_id)
      setFlowResult(t('authOkMsg', { grant: res.data.grant_type }))
      toast.ok(t('authOkToast', { grant: res.data.grant_type }))
    }
  }

  const submitRevoke = async () => {
    const target = viewId.trim()
    if (!target) return
    const res = await run('POST', `/v1/change-sets/${target}/revoke`, () =>
      revokeChangeSet(target, { reason: revokeReason }, {
        idempotencyScope: idempotencyScopeFor('cs-revoke', target, revokeReason),
      }))
    if (res) {
      setFlowResult(t('proposalRevokedMsg', { status: res.data.status }))
      upsertChangeSet({ id: res.data.id, status: res.data.status })
      toast.info(t('proposalRevokedToast', { status: res.data.status }))
    }
  }

  const submitExecute = async () => {
    const target = viewId.trim()
    if (!target || !execAuthId.trim()) return
    const res = await run('POST', `/v1/change-sets/${target}/execute`, () =>
      executeChangeSet(target, { authorization_id: execAuthId.trim() }, {
        // 最高危路径：同提案 + 同授权重试必须复用同一幂等键，避免重复发布
        idempotencyScope: idempotencyScopeFor('cs-execute', target, execAuthId.trim()),
      }))
    if (res) {
      addExecution({ executionId: res.data.execution_id, jobId: res.data.job_id, status: res.data.status })
      setExecResult(res.data)
      setFlowResult(null)
      toast.ok(t('executionAcceptedToast', { exec: res.data.execution_id, job: res.data.job_id }))
    }
  }

  return (
    <div className="page">
      <ErrorBanner error={error} />
      <Card title={t('wizardTitle')} subtitle={t('wizardSub')}>
        <Steps current={step} labels={STEP_KEYS.map((k) => t(k))} />
        {flowResult && <p className="flow-result"><Badge tone="info">{t('info')}</Badge> {flowResult}</p>}

        {step === 1 && (
          <>
            {entries.map((entry, idx) => (
              <div className="entry-block" key={idx}>
                <header className="entry-head">
                  <strong>{t('entryProductTitle', { n: idx + 1 })}</strong>
                  {entries.length > 1 && (
                    <Button variant="ghost" onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))}>{t('remove')}</Button>
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
                  <Field label="variant_id" hint={t('optional')}>
                    <TextInput value={entry.variantId} onChange={(e) => patchEntry(idx, { variantId: e.target.value })} />
                  </Field>
                </div>
                {entry.edits.map((edit, eidx) => (
                  <div className="edit-block" key={eidx}>
                    <header className="entry-head">
                      <span className="muted">{t('fieldEditN', { n: eidx + 1 })}</span>
                      {entry.edits.length > 1 && (
                        <Button variant="ghost" onClick={() => setEntries((prev) => prev.map((e, i) => (
                          i === idx ? { ...e, edits: e.edits.filter((_, j) => j !== eidx) } : e
                        )))}>{t('remove')}</Button>
                      )}
                    </header>
                    <div className="grid-3">
                      <Field label={t('fieldTargetField')} hint={t('hintWhitelist')}>
                        <Select value={edit.fieldPath} onChange={(e) => patchEdit(idx, eidx, { fieldPath: e.target.value })}>
                          {FIELD_WHITELIST.map((f) => <option key={f} value={f}>{f}</option>)}
                        </Select>
                      </Field>
                      <Field label="asset_id" hint={t('hintAssetImage')}>
                        <TextInput value={edit.assetId} onChange={(e) => patchEdit(idx, eidx, { assetId: e.target.value })} />
                      </Field>
                      <Field label={t('fieldProposedValue')}>
                        <TextInput value={edit.proposedValue} onChange={(e) => patchEdit(idx, eidx, { proposedValue: e.target.value })} />
                      </Field>
                    </div>
                    <Field label={t('fieldFactRefs')} hint={t('hintFactRefs')}>
                      <TextArea rows={2} value={edit.factRefsRaw} onChange={(e) => patchEdit(idx, eidx, { factRefsRaw: e.target.value })} />
                    </Field>
                  </div>
                ))}
                <Button variant="ghost" onClick={() => setEntries((prev) => prev.map((e, i) => (
                  i === idx
                    ? { ...e, edits: [...e.edits, { fieldPath: 'seo.description', proposedValue: '', assetId: '', factRefsRaw: '' }] }
                    : e
                )))}>{t('btnAddFieldEdit')}</Button>
              </div>
            ))}
            <div className="row gap">
              <Button variant="ghost" onClick={() => setEntries((prev) => [...prev, emptyEntry()])}>{t('btnAddProduct')}</Button>
              <Button variant="primary" disabled={!canPropose || loading} onClick={() => void submitDraft()}>
                {loading ? t('submitting') : t('btnSubmitDraft')}
              </Button>
              {!canPropose && <p className="muted">{t('noPermPropose')}</p>}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {created && (
              <div className="result-col">
                <ResultRow label={t('labelProposalId')}><MonoText>{created.id}</MonoText></ResultRow>
                <ResultRow label={t('labelContentHash')}><MonoText>{created.content_hash.slice(0, 32)}…</MonoText></ResultRow>
                <ResultRow label={t('labelVersionItems')}><Badge tone="neutral">{t('versionItemsBadge', { v: created.proposal_version, count: created.item_count })}</Badge></ResultRow>
              </div>
            )}
            <div className="row gap">
              <TextInput value={viewId} onChange={(e) => setViewId(e.target.value)} placeholder={t('phExistingProposal')} style={{ maxWidth: 360 }} />
              <Button disabled={!canRead || loading || !viewId.trim()} onClick={() => void querySet()}>{t('btnRefreshStatus')}</Button>
              <Button variant="ghost" onClick={() => setStep(1)}>
                <span className="btn-icon-text"><IconChevronLeft size={13} /> {t('btnBackToDraft')}</span>
              </Button>
            </div>
            {view && (
              <div className="result-col">
                <ResultRow label={t('labelCurrentStatus')}><StatusBadge status={view.status} fallbackLabel={view.status} /></ResultRow>
                <ResultRow label={t('labelHashEcho')}><MonoText>{view.content_hash}</MonoText></ResultRow>
                <ResultRow label={t('labelHashSchema')}>
                  {view.hash_schema_version
                    ? <Badge tone="info">v{view.hash_schema_version}{view.hash_schema_version >= 2 ? t('dualBaseline') : ''}</Badge>
                    : <span className="muted">{t('hashNotDeclared')}</span>}
                </ResultRow>
                <ResultRow label={t('labelChangeItems')}><Badge tone="neutral">{t('itemsCount', { count: view.items.length })}</Badge></ResultRow>
                {view.items.length > 0 && <JsonView value={view.items} label={t('labelChangeItems')} />}
              </div>
            )}
            <div className="grid-2 cards inner">
              <div className="col gap">
                <strong>{t('authorizeTitle')}</strong>
                <Field label={t('fieldProposalVersion')} hint={t('hintVersionMatch')}>
                  <TextInput value={proposalVersion} onChange={(e) => setProposalVersion(e.target.value)} />
                </Field>
                <Field label={t('fieldAuthReason')}>
                  <TextArea rows={2} value={authReason} onChange={(e) => setAuthReason(e.target.value)} />
                </Field>
                <Button variant="primary" disabled={!canAuthorize || loading || !viewId.trim()} onClick={() => void submitAuthorize()}>
                  {t('btnAuthorize')}
                </Button>
                {!canAuthorize && <p className="muted">{t('noPermAuthorize')}</p>}
              </div>
              <div className="col gap">
                <strong>{t('revokeTitle')}</strong>
                <Field label={t('fieldRevokeReason')}>
                  <TextInput value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
                </Field>
                <Button variant="danger" disabled={!canAuthorize || loading || !viewId.trim()} onClick={() => void submitRevoke()}>
                  {t('btnRevokeProposal')}
                </Button>
                <Button variant="primary" disabled={!execAuthId.trim()} onClick={() => setStep(3)}>
                  <span className="btn-icon-text">{t('btnNextExecute')} <IconArrowRight size={13} /></span>
                </Button>
                {execAuthId
                  ? <p className="muted">{t('hasAuthorization')} <MonoText>{execAuthId}</MonoText></p>
                  : <p className="muted">{t('needAuthHint')}</p>}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="col gap">
              <strong>{t('executeTitle')}</strong>
              <Field label={t('fieldAuthId')} hint={t('hintAuthId')}>
                <TextInput value={execAuthId} onChange={(e) => setExecAuthId(e.target.value)} />
              </Field>
              <div className="row gap">
                <Button variant="primary" disabled={!canExecute || loading || !viewId.trim() || !execAuthId.trim()} onClick={() => void submitExecute()}>
                  {loading ? t('submitting') : t('btnConfirmExecute')}
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  <span className="btn-icon-text"><IconChevronLeft size={13} /> {t('btnBackToReview')}</span>
                </Button>
                {!canExecute && <p className="muted">{t('noPermExecute')}</p>}
              </div>
            </div>
          </>
        )}
      </Card>

      {step === 3 && execResult && (
        <Card title={t('executionAcceptedTitle')} subtitle={t('executionAcceptedSub')}>
          <div className="result-col">
            <ResultRow label={t('labelProposalId')}><MonoText>{viewId}</MonoText></ResultRow>
            <ResultRow label={t('labelExecId')}><MonoText>{execResult.execution_id}</MonoText></ResultRow>
            <ResultRow label={t('labelJobId')}><MonoText>{execResult.job_id}</MonoText></ResultRow>
            <ResultRow label={t('labelCurrentStatus')}><StatusBadge status={execResult.status} fallbackLabel={execResult.status} /></ResultRow>
            <Button variant="primary" onClick={() => navigate('tasks')}>
              <span className="btn-icon-text">{t('btnTrackExecution')} <IconArrowRight size={13} /></span>
            </Button>
          </div>
        </Card>
      )}

      <Card title={t('proposalListTitle')} subtitle={t('proposalListSub')}>
        {tenantChangeSets.length === 0 ? (
          <div className="empty">
            <div className="empty-text">{t('proposalListEmpty')}</div>
            <div className="empty-action">
              <Button variant="primary" onClick={() => setStep(1)}>{t('btnStartDraft')}</Button>
            </div>
          </div>
        ) : (
          <table className="table">
            <thead><tr><th>{t('thId')}</th><th>{t('status')}</th><th>{t('version')}</th><th>{t('thAuthCredential')}</th><th>{t('thCreatedAt')}</th><th></th></tr></thead>
            <tbody>
              {tenantChangeSets.map((c) => (
                <tr key={c.id}>
                  <td><MonoText>{c.id}</MonoText></td>
                  <td>{c.status ? <StatusBadge status={c.status} fallbackLabel={c.status} /> : '—'}</td>
                  <td>{c.proposalVersion ? `v${c.proposalVersion}` : '—'}</td>
                  <td>{c.authorizationId ? <MonoText>{c.authorizationId}</MonoText> : <span className="muted">{t('notAuthorized')}</span>}</td>
                  <td className="muted">{c.createdAt}</td>
                  <td>
                    <Button className="btn-xs" onClick={() => void loadFromList(c.id, c)}>{t('btnContinue')}</Button>
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
