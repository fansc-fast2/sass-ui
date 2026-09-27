// 页面级 API 调用封装：loading/错误状态 + 自动写操作日志（含 request_id）。
// 操作失败时统一弹出 toast（code + message + request_id），与页面内
// ErrorBanner 双通道反馈；错误详情仍以页面内 ErrorBanner 为准。

import { useCallback, useState } from 'react'
import { ApiRequestError } from '../api/client'
import type { ApiResult } from '../api/client'
import { useAppState } from './AppStateContext'
import { toast } from '../components/Toast'

export function useApiOperation() {
  const { logOp } = useAppState()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const run = useCallback(
    async <T,>(method: string, path: string, fn: () => Promise<ApiResult<T>>): Promise<ApiResult<T> | null> => {
      setLoading(true)
      setError(null)
      try {
        const res = await fn()
        logOp({ method, path, status: res.status, elapsedMs: res.elapsedMs, requestId: res.requestId })
        return res
      } catch (e) {
        setError(e)
        if (e instanceof ApiRequestError) {
          logOp({ method, path, status: 'ERR', code: e.code, elapsedMs: 0, requestId: e.requestId })
        } else {
          logOp({ method, path, status: 'ERR', elapsedMs: 0 })
        }
        toast.errorFrom(e)
        return null
      } finally {
        setLoading(false)
      }
    },
    [logOp],
  )

  return { loading, error, setError, run }
}
