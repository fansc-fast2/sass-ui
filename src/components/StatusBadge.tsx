// 状态语义（10 §4 + 19 §4 P06）：状态展示 = 图形 + 图标 + 文字，不只靠颜色；
// hover title 携带完整状态语义文案（10 §4 是硬要求）。
// queued=已排队尚未修改；written=已保存未验证；outcome_unknown=待核对不重复写入；
// partial=部分成功；verification_failed=已写入但公开页未通过；stale=依据已变化。
// 双语：label/detail 全部来自 i18n 字典（stXxx / stXxxDetail），按当前语言输出。

import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import type { MsgKey, TFunc } from '../i18n'
import { Badge } from './ui'
import { IconAlert, IconCheck, IconClock, IconHelpCircle, IconRefresh, IconX } from './icons'

type Tone = 'neutral' | 'ok' | 'warn' | 'err' | 'info'
type Shape = 'dot' | 'square' | 'diamond' | 'triangle'

export interface StatusSemantic {
  label: string
  /** 完整状态语义（title 展示，10 §4 文案） */
  detail?: string
  tone: Tone
  shape: Shape
  icon: ReactNode
}

// 视觉元数据（与语言无关）：tone/shape/icon
interface StatusMeta { tone: Tone; shape: Shape; icon: ReactNode }

// 10 §4 状态文案（执行/变更域的六种关键状态）+ 执行检查项状态 + 提案域状态
const STATUS_DEFS: Record<string, { meta: StatusMeta; labelKey: MsgKey; detailKey: MsgKey }> = {
  // 执行域
  queued: { meta: { tone: 'neutral', shape: 'dot', icon: <IconClock size={11} /> }, labelKey: 'stQueued', detailKey: 'stQueuedDetail' },
  running: { meta: { tone: 'info', shape: 'square', icon: <IconRefresh size={11} /> }, labelKey: 'stRunning', detailKey: 'stRunningDetail' },
  succeeded: { meta: { tone: 'ok', shape: 'dot', icon: <IconCheck size={11} /> }, labelKey: 'stSucceeded', detailKey: 'stSucceededDetail' },
  written: { meta: { tone: 'info', shape: 'square', icon: <IconCheck size={11} /> }, labelKey: 'stWritten', detailKey: 'stWrittenDetail' },
  outcome_unknown: { meta: { tone: 'warn', shape: 'diamond', icon: <IconHelpCircle size={11} /> }, labelKey: 'stOutcomeUnknown', detailKey: 'stOutcomeUnknownDetail' },
  partial: { meta: { tone: 'warn', shape: 'triangle', icon: <IconAlert size={11} /> }, labelKey: 'stPartial', detailKey: 'stPartialDetail' },
  failed: { meta: { tone: 'err', shape: 'diamond', icon: <IconX size={11} /> }, labelKey: 'stFailed', detailKey: 'stFailedDetail' },
  verification_failed: { meta: { tone: 'err', shape: 'diamond', icon: <IconX size={11} /> }, labelKey: 'stVerificationFailed', detailKey: 'stVerificationFailedDetail' },
  stale: { meta: { tone: 'warn', shape: 'triangle', icon: <IconRefresh size={11} /> }, labelKey: 'stStale', detailKey: 'stStaleDetail' },
  cancelled: { meta: { tone: 'neutral', shape: 'dot', icon: <IconX size={11} /> }, labelKey: 'stCancelled', detailKey: 'stCancelledDetail' },
  // 执行检查项状态（data/publish/page 三层检查）
  passed: { meta: { tone: 'ok', shape: 'dot', icon: <IconCheck size={11} /> }, labelKey: 'stPassed', detailKey: 'stPassedDetail' },
  pending: { meta: { tone: 'neutral', shape: 'dot', icon: <IconClock size={11} /> }, labelKey: 'stPending', detailKey: 'stPendingDetail' },
  // 提案域状态
  draft: { meta: { tone: 'neutral', shape: 'dot', icon: <IconClock size={11} /> }, labelKey: 'stDraft', detailKey: 'stDraftDetail' },
  proposed: { meta: { tone: 'info', shape: 'square', icon: <IconClock size={11} /> }, labelKey: 'stProposed', detailKey: 'stProposedDetail' },
  authorized: { meta: { tone: 'ok', shape: 'dot', icon: <IconCheck size={11} /> }, labelKey: 'stAuthorized', detailKey: 'stAuthorizedDetail' },
  executing: { meta: { tone: 'info', shape: 'square', icon: <IconRefresh size={11} /> }, labelKey: 'stExecuting', detailKey: 'stExecutingDetail' },
  executed: { meta: { tone: 'ok', shape: 'dot', icon: <IconCheck size={11} /> }, labelKey: 'stExecuted', detailKey: 'stExecutedDetail' },
  revoked: { meta: { tone: 'neutral', shape: 'dot', icon: <IconX size={11} /> }, labelKey: 'stRevoked', detailKey: 'stRevokedDetail' },
  expired: { meta: { tone: 'warn', shape: 'triangle', icon: <IconRefresh size={11} /> }, labelKey: 'stExpired', detailKey: 'stExpiredDetail' },
}

function semanticOf(status: string, t: TFunc): StatusSemantic {
  const def = STATUS_DEFS[status]
  if (def) {
    return { label: t(def.labelKey), detail: t(def.detailKey), ...def.meta }
  }
  return { label: t('stUnknownWithStatus', { status }), tone: 'neutral', shape: 'diamond', icon: <IconHelpCircle size={11} /> }
}

/** 按 status 查内置双语映射（10 §4 语义文案）。 */
export function statusSemantic(status: string): StatusSemantic {
  const { t } = useLang()
  return semanticOf(status, t)
}

/** 旧接口兼容：任务状态标签（含 requires_attention 覆盖）。 */
export function jobStatusLabel(status: string, requiresAttention?: boolean): string {
  const { t } = useLang()
  if (status === 'running' && requiresAttention) return t('attention')
  return semanticOf(status, t).label
}

/** 统一状态徽标：形状 + 图标 + 文字（色盲可辨），title 携带 10 §4 语义文案。 */
export function StatusBadge({ status, semantic, fallbackLabel, title }: {
  /** 优先用 status 查内置映射；或直接传 semantic */
  status?: string
  semantic?: StatusSemantic
  fallbackLabel?: string
  title?: string
}) {
  const { t } = useLang()
  const s = semantic ?? semanticOf(status ?? '', t)
  const label = fallbackLabel ?? s.label
  return (
    <span
      className={`status-badge status-${s.tone} shape-${s.shape}`}
      title={title ?? s.detail ?? label}
    >
      <span className={`status-shape shape-${s.shape}`} aria-hidden />
      <span className="status-icon" aria-hidden>{s.icon}</span>
      {label}
    </span>
  )
}

/** 任务状态徽标：running 且 requires_attention 时显示"需要处理"。 */
export function JobStatusBadge({ status, requiresAttention }: { status: string; requiresAttention?: boolean }) {
  const { t } = useLang()
  if (status === 'running' && requiresAttention) {
    return (
      <StatusBadge
        semantic={{ label: t('attention'), detail: t('attentionDetail'), tone: 'warn', shape: 'square', icon: <IconRefresh size={11} /> }}
      />
    )
  }
  return <StatusBadge status={status} />
}

// 概览卡状态（20 §3）：available 时 value+as_of 必有值；其他状态 value 为 null，
// 不能把依赖错误显示成 0。
const CARD_STATUS_KEYS: Record<string, MsgKey> = {
  available: 'cardAvailable',
  not_connected: 'cardNotConnected',
  not_checked: 'cardNotChecked',
  unavailable: 'cardUnavailable',
}

export function overviewCardValue(value: number | null, status: string): string {
  const { t } = useLang()
  if (status === 'available' && value !== null) return String(value)
  const key = CARD_STATUS_KEYS[status]
  return key ? t(key) : t('stUnknown')
}

/** 兼容旧用法：Badge 包装的简易状态。 */
export function SimpleStatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>
}
