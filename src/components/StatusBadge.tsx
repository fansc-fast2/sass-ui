// 任务状态展示：由 navigation.json 的确定性映射产生（19 §4 P06）。
// queued=等待执行；running=正在处理（requires_attention 时为需要处理）；
// succeeded=已完成；partial=部分完成；failed=执行异常；cancelled=已取消。
// outcome_unknown 是执行分项状态，在详情显示"正在核对结果"；
// 未知枚举保守显示"状态待识别"。

import { Badge } from './ui'

const JOB_LABELS: Record<string, string> = {
  queued: '等待执行',
  running: '正在处理',
  succeeded: '已完成',
  partial: '部分完成',
  failed: '执行异常',
  cancelled: '已取消',
}

export function jobStatusLabel(status: string, requiresAttention?: boolean): string {
  if (status === 'running' && requiresAttention) return '需要处理'
  return JOB_LABELS[status] ?? '状态待识别'
}

const TONES: Record<string, 'neutral' | 'ok' | 'warn' | 'err' | 'info'> = {
  queued: 'neutral',
  running: 'info',
  succeeded: 'ok',
  partial: 'warn',
  failed: 'err',
  cancelled: 'neutral',
}

export function JobStatusBadge({ status, requiresAttention }: { status: string; requiresAttention?: boolean }) {
  let tone = TONES[status] ?? 'warn'
  if (status === 'running' && requiresAttention) tone = 'warn'
  return <Badge tone={tone}>{jobStatusLabel(status, requiresAttention)}</Badge>
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
