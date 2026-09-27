// 稳定幂等键（10 §5）：页面刷新不丢失幂等键，重试使用同一请求内容。
// sessionStorage 按"逻辑操作 scope"存 键值映射：同一 scope 永远返回同一个
// Idempotency-Key——网络重试、页面刷新、组件重挂载都不会生成新键。
// scope 由调用方用请求内容派生（见 idempotencyScopeFor 的内容哈希），
// 内容不同 = 不同 scope = 不同键，避免误命中服务端幂等去重。

const STORE_KEY = 'pk.idempotency-keys'

type KeyMap = Record<string, string>

function load(): KeyMap {
  try {
    const raw = sessionStorage.getItem(STORE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as KeyMap
  } catch {
    return {}
  }
}

function save(map: KeyMap): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(map))
  } catch {
    // sessionStorage 不可用（隐私模式等）：退化为内存行为，仅本次会话内稳定
  }
}

function newKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** 同一 scope 稳定返回同一幂等键（跨重试、跨页面刷新）。 */
export function stableIdempotencyKey(scope: string): string {
  const map = load()
  const existing = map[scope]
  if (existing) return existing
  const key = newKey()
  map[scope] = key
  save(map)
  return key
}

/** 操作成功落定后可调用，清理该 scope（防止 sessionStorage 无限增长）。 */
export function forgetIdempotencyKey(scope: string): void {
  const map = load()
  if (scope in map) {
    delete map[scope]
    save(map)
  }
}

/** djb2 风格字符串哈希：把请求体并入 scope，保证"同内容同键、异内容异键"。 */
export function hashContent(input: unknown): string {
  const text = typeof input === 'string' ? input : JSON.stringify(input) ?? ''
  let hash = 5381
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16)
}

/** 组合 scope：域 + 业务对象 + 请求内容哈希。 */
export function idempotencyScopeFor(domain: string, target: string, body?: unknown): string {
  return body === undefined ? `${domain}:${target}` : `${domain}:${target}:${hashContent(body)}`
}
