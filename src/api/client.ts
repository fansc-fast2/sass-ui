// 统一 API 客户端：Bearer 凭据（test-cred 模拟器）、Idempotency-Key、
// {request_id, data} / {request_id, error} 信封解包、降级模式头透出。
// 同源部署：vite dev/preview 把 /health、/v1、/integrations 代理到 platform-api。

import type { ApiErrorPayload, Envelope } from './types'
import { stableIdempotencyKey } from './idempotency'

/** 业务错误：携带信封里的 code/retryable/request_id，供界面精确提示。 */
export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor(status: number, payload: ApiErrorPayload, requestId: string) {
    super(payload.message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = payload.code
    this.requestId = requestId
    this.retryable = payload.retryable
    this.details = payload.details
  }
}

/** 网络层错误（后端不可达、代理断开等）。 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export interface ApiResult<T> {
  data: T
  requestId: string
  status: number
  /** GET 在身份控制面不可用时的只读降级标记（02 §5）。 */
  degraded: boolean
  elapsedMs: number
}

let tokenProvider: () => string | null = () => null

/** 由 SessionContext 注入当前凭据；避免客户端依赖 React。 */
export function setTokenProvider(fn: () => string | null): void {
  tokenProvider = fn
}

export function idempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `key-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export interface RequestOptions {
  body?: unknown
  /** POST 全部是幂等端点（07 §3），默认自动生成 Idempotency-Key；重试换新键。 */
  idempotency?: boolean
  signal?: AbortSignal
  /** 查询参数；undefined/空串字段自动省略。 */
  query?: Record<string, string | number | boolean | undefined>
  /**
   * 幂等键 scope（10 §5：页面刷新不丢失幂等键，重试使用同一请求内容）。
   * 传入时 Idempotency-Key 取 sessionStorage 稳定键（同 scope 同键），
   * 用于创建/授权/执行发布等发布路径；不传保持原行为。
   */
  idempotencyScope?: string
}

function buildQuery(q: RequestOptions['query']): string {
  if (!q) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === '') continue
    sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function parseEnvelope<T>(res: Response): Promise<Envelope<T>> {
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text === '' ? null : JSON.parse(text)
  } catch {
    throw new NetworkError(`响应不是合法 JSON（HTTP ${res.status}）`)
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new NetworkError(`响应缺少信封（HTTP ${res.status}）`)
  }
  return parsed as Envelope<T>
}

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  opts: RequestOptions = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenProvider()
  if (token) headers.Authorization = `Bearer ${token}`
  if (method === 'POST' || method === 'PATCH') {
    headers['Content-Type'] = 'application/json'
    headers['Idempotency-Key'] = opts.idempotencyScope
      ? stableIdempotencyKey(opts.idempotencyScope)
      : idempotencyKey()
  }

  const started = performance.now()
  let res: Response
  try {
    res = await fetch(path + buildQuery(opts.query), {
      method,
      headers,
      body: method === 'POST' || method === 'PATCH' ? JSON.stringify(opts.body ?? {}) : undefined,
      signal: opts.signal,
    })
  } catch (err) {
    throw new NetworkError(
      err instanceof Error ? `无法连接平台 API（${err.message}）` : '无法连接平台 API',
    )
  }
  const elapsedMs = Math.round(performance.now() - started)
  const degraded = res.headers.get('X-Degraded-Mode') === 'readonly'

  const envelope = await parseEnvelope<T>(res)
  if (!res.ok) {
    const errPayload = (envelope as Partial<Envelope<ApiErrorPayload>>).data
    if (errPayload && typeof errPayload === 'object' && 'code' in errPayload) {
      throw new ApiRequestError(res.status, errPayload, envelope.request_id)
    }
    throw new NetworkError(`HTTP ${res.status}：响应缺少错误信封`)
  }
  return {
    data: envelope.data,
    requestId: envelope.request_id,
    status: res.status,
    degraded,
    elapsedMs,
  }
}

export function getHealth(): Promise<ApiResult<{ status: string }>> {
  return apiRequest('GET', '/health')
}
