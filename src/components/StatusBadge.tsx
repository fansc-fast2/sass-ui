// 状态语义（10 §4 + 19 §4 P06）：状态展示 = 图形 + 图标 + 文字，不只靠颜色；
// hover title 携带完整状态语义文案（10 §4 是硬要求）。
// queued=已排队尚未修改；written=已保存未验证；outcome_unknown=待核对不重复写入；
// partial=部分成功；verification_failed=已写入但公开页未通过；stale=依据已变化。

import type { ReactNode } from 'react'
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

// 10 §4 状态文案（执行/变更域的六种关键状态）
const SEMANTICS: Record<string, StatusSemantic> = {
  queued: {
    label: '已排队', detail: '已排队，尚未修改内容', tone: 'neutral', shape: 'dot', icon: <IconClock size={11} />,
  },
  running: {
    label: '正在处理', detail: '任务处理中，内容可能已被部分修改', tone: 'info', shape: 'square', icon: <IconRefresh size={11} />,
  },
  succeeded: {
    label: '已完成', detail: '全部项目处理完成并通过验证', tone: 'ok', shape: 'dot', icon: <IconCheck size={11} />,
  },
  written: {
    label: '已写入', detail: '内容已保存，尚未完成发布验证', tone: 'info', shape: 'square', icon: <IconCheck size={11} />,
  },
  outcome_unknown: {
    label: '待核对', detail: '请求结果待核对，系统不会重复写入', tone: 'warn', shape: 'diamond', icon: <IconHelpCircle size={11} />,
  },
  partial: {
    label: '部分成功', detail: '部分项目已验证，其余需要处理', tone: 'warn', shape: 'triangle', icon: <IconAlert size={11} />,
  },
  failed: {
    label: '执行异常', detail: '执行中断，已有副作用见执行详情', tone: 'err', shape: 'diamond', icon: <IconX size={11} />,
  },
  verification_failed: {
    label: '验证失败', detail: '已写入，但公开页面未通过检查', tone: 'err', shape: 'diamond', icon: <IconX size={11} />,
  },
  stale: {
    label: '依据已变化', detail: '依据或内容已变化，需要重新生成或确认', tone: 'warn', shape: 'triangle', icon: <IconRefresh size={11} />,
  },
  cancelled: {
    label: '已取消', detail: '任务已取消；取消是请求，不保证立即生效', tone: 'neutral', shape: 'dot', icon: <IconX size={11} />,
  },
  // 执行检查项状态（data/publish/page 三层检查）
  passed: {
    label: '已通过', detail: '该检查项通过', tone: 'ok', shape: 'dot', icon: <IconCheck size={11} />,
  },
  pending: {
    label: '待执行', detail: '该检查项尚未执行', tone: 'neutral', shape: 'dot', icon: <IconClock size={11} />,
  },
}

// 提案域状态
const CHANGE_SET_SEMANTICS: Record<string, StatusSemantic> = {
  draft: { label: '草稿', detail: '提案起草中，尚未送审', tone: 'neutral', shape: 'dot', icon: <IconClock size={11} /> },
  proposed: { label: '待评审', detail: '已送审，等待评审授权', tone: 'info', shape: 'square', icon: <IconClock size={11} /> },
  authorized: { label: '已授权', detail: '评审通过并授权，可执行（授权 24 小时内有效）', tone: 'ok', shape: 'dot', icon: <IconCheck size={11} /> },
  executing: { label: '执行中', detail: '正在执行发布，结果待核对', tone: 'info', shape: 'square', icon: <IconRefresh size={11} /> },
  executed: { label: '已执行', detail: '执行完成，发布验证结果见执行详情', tone: 'ok', shape: 'dot', icon: <IconCheck size={11} /> },
  revoked: { label: '已作废', detail: '提案已撤销，不再可执行', tone: 'neutral', shape: 'dot', icon: <IconX size={11} /> },
  expired: { label: '已过期', detail: '依据已过期，需要重新生成或确认', tone: 'warn', shape: 'triangle', icon: <IconRefresh size={11} /> },
}

const FALLBACK: StatusSemantic = {
  label: '状态待识别', tone: 'neutral', shape: 'diamond', icon: <IconHelpCircle size={11} />,
}

export function statusSemantic(status: string): StatusSemantic {
  return SEMANTICS[status] ?? CHANGE_SET_SEMANTICS[status] ?? { ...FALLBACK, label: `${status}（状态待识别）` }
}

/** 旧接口兼容：任务状态中文标签（含 requires_attention 覆盖）。 */
export function jobStatusLabel(status: string, requiresAttention?: boolean): string {
  if (status === 'running' && requiresAttention) return '需要处理'
  return SEMANTICS[status]?.label ?? (CHANGE_SET_SEMANTICS[status]?.label ?? '状态待识别')
}

/** 统一状态徽标：形状 + 图标 + 文字（色盲可辨），title 携带 10 §4 语义文案。 */
export function StatusBadge({ status, semantic, fallbackLabel, title }: {
  /** 优先用 status 查内置映射；或直接传 semantic */
  status?: string
  semantic?: StatusSemantic
  fallbackLabel?: string
  title?: string
}) {
  const s = semantic ?? statusSemantic(status ?? '')
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
  const semantic = SEMANTICS[status] ?? FALLBACK
  if (status === 'running' && requiresAttention) {
    return (
      <StatusBadge
        semantic={{ ...semantic, label: '需要处理', tone: 'warn' }}
        title="任务暂停等待人工处理；请查看暂停原因（不提供无权限的强制成功按钮）"
      />
    )
  }
  return <StatusBadge status={status} />
}

// 概览卡状态（20 §3）：available 时 value+as_of 必有值；其他状态 value 为 null，
// 不能把依赖错误显示成 0。
const CARD_STATUS_LABELS: Record<string, string> = {
  available: '可用',
  not_connected: '未接通',
  not_checked: '未检查',
  unavailable: '不可用',
}

export function overviewCardValue(value: number | null, status: string): string {
  if (status === 'available' && value !== null) return String(value)
  return CARD_STATUS_LABELS[status] ?? '状态待识别'
}

/** 兼容旧用法：Badge 包装的简易状态。 */
export function SimpleStatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge tone={tone}>{children}</Badge>
}
