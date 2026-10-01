// 相对时间（10 §2 硬要求）：列表里显示"3 分钟前"/"3 min ago"这样的相对时间，
// 按 i18n 语言输出（Intl.RelativeTimeFormat）；hover title 给出本地完整时间与 UTC，
// 两个时区都可核对（"本地/Local" 标注随语言）。
// 无法解析的值原样返回（骨架阶段的占位字符串不做假装格式化）。

import { useLang } from '../i18n'
import { langTag } from '../i18n'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function formatLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
}

function relative(deltaMs: number, tag: string): string {
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: 'auto' })
  const future = deltaMs < 0
  const abs = Math.abs(deltaMs)
  const sign = future ? 1 : -1
  if (abs < MINUTE) return rtf.format(sign * Math.max(1, Math.round(abs / 1000)), 'second')
  if (abs < HOUR) return rtf.format(sign * Math.floor(abs / MINUTE), 'minute')
  if (abs < DAY) return rtf.format(sign * Math.floor(abs / HOUR), 'hour')
  if (abs < 30 * DAY) return rtf.format(sign * Math.floor(abs / DAY), 'day')
  if (abs < 365 * DAY) return rtf.format(sign * Math.floor(abs / (30 * DAY)), 'month')
  return rtf.format(sign * Math.floor(abs / (365 * DAY)), 'year')
}

function timeTitle(t: ReturnType<typeof useLang>['t'], d: Date): string {
  return t('timeTitle', { local: formatLocal(d), utc: formatUtc(d) })
}

export function RelativeTime({ value, fallback = '—', className }: {
  value: string | number | Date | null | undefined
  /** 空值占位 */
  fallback?: string
  className?: string
}) {
  const { lang, t } = useLang()
  if (value === null || value === undefined || value === '') {
    return <span className={className}>{fallback}</span>
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) {
    // 非法/占位字符串：原样显示，不做格式化
    return <span className={className}>{String(value)}</span>
  }
  const delta = d.getTime() - Date.now()
  return (
    <span
      className={className}
      title={timeTitle(t, d)}
    >
      {relative(delta, langTag(lang))}
    </span>
  )
}

/** 完整时间（本地）+ title 双时区，用于需要精确时间的列（审计/创建时间等）。 */
export function FullTime({ value, fallback = '—' }: {
  value: string | number | Date | null | undefined
  fallback?: string
}) {
  const { t } = useLang()
  if (value === null || value === undefined || value === '') {
    return <>{fallback}</>
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return <>{String(value)}</>
  return (
    <span title={timeTitle(t, d)}>
      {formatLocal(d)}
    </span>
  )
}
