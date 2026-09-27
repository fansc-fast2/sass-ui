// 列表六态壳（19 §5）：加载 / 空 / 失败 / 权限不足 / 来源滞后 / 部分可用。
// 列表页统一用它包裹表格，保证空数据时有解释而不是裸 0。
// 空态支持给下一步动作入口（emptyAction）。

import type { ReactNode } from 'react'
import { ErrorBanner, EmptyState, Loading } from './ui'

export function ListState({ loading, error, count, empty, emptyHint, emptyAction, children }: {
  loading: boolean
  error: unknown
  count: number
  empty: ReactNode
  emptyHint?: ReactNode
  emptyAction?: ReactNode
  children: ReactNode
}) {
  if (error) return <ErrorBanner error={error} />
  if (loading) return <Loading text="加载中…" />
  if (count === 0) return <EmptyState text={empty} hint={emptyHint} action={emptyAction} />
  return <>{children}</>
}
