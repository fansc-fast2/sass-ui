// 相对时间（10 §2 硬要求）：列表里显示"3 分钟前"这样的相对时间；
// hover title 给出本地完整时间与 UTC，两个时区都可核对。
// 无法解析的值原样返回（骨架阶段的占位字符串不做假装格式化）。

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

function relative(deltaMs: number): string {
  const future = deltaMs < 0
  const abs = Math.abs(deltaMs)
  let text: string
  if (abs < MINUTE) text = '1 分钟内'
  else if (abs < HOUR) text = `${Math.floor(abs / MINUTE)} 分钟`
  else if (abs < DAY) text = `${Math.floor(abs / HOUR)} 小时`
  else if (abs < 30 * DAY) text = `${Math.floor(abs / DAY)} 天`
  else if (abs < 365 * DAY) text = `${Math.floor(abs / (30 * DAY))} 个月`
  else text = `${Math.floor(abs / (365 * DAY))} 年`
  return future ? `${text}后` : `${text}前`
}

export function RelativeTime({ value, fallback = '—', className }: {
  value: string | number | Date | null | undefined
  /** 空值占位 */
  fallback?: string
  className?: string
}) {
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
      title={`本地 ${formatLocal(d)} · ${formatUtc(d)}`}
    >
      {relative(delta)}
    </span>
  )
}

/** 完整时间（本地）+ title 双时区，用于需要精确时间的列（审计/创建时间等）。 */
export function FullTime({ value, fallback = '—' }: {
  value: string | number | Date | null | undefined
  fallback?: string
}) {
  if (value === null || value === undefined || value === '') {
    return <>{fallback}</>
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return <>{String(value)}</>
  return (
    <span title={`本地 ${formatLocal(d)} · ${formatUtc(d)}`}>
      {formatLocal(d)}
    </span>
  )
}
