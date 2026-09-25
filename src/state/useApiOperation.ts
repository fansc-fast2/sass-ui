// 页面级 API 调用封装：loading/错误状态 + 自动写操作日志（含 request_id）。

import { useCallback, useState } from 'react'
import { ApiRequestError } from '../api/client'
import type { ApiResult } from '../api/client'
import { useAppState } from './AppStateContext'

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
        return null
      } finally {
        setLoading(false)
      }
    },
    [logOp],
  )

  return { loading, error, setError, run }
}
