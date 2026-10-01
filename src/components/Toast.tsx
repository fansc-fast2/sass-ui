// 全局轻提示（Toast）：Mutation 结果的统一反馈入口。
// 用模块级事件总线而不是 Context——OpsApp 与租户面两个 shell 都能直接调用
// toast.success / toast.error / toast.info，无需各自包 Provider。
// 错误提示统一展示 code + message + request_id（业务错误）。

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiRequestError } from '../api/client'
import { useLang } from '../i18n'
import { IconAlert, IconCheck, IconInfo, IconX } from './icons'

export type ToastKind = 'ok' | 'err' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: ReactNode
}

type Listener = (items: ToastItem[]) => void

let items: ToastItem[] = []
let seq = 0
const listeners = new Set<Listener>()
const timers = new Map<number, number>()

function emit() {
  for (const l of listeners) l(items)
}

function push(kind: ToastKind, message: ReactNode, durationMs = 4200) {
  const id = ++seq
  items = [...items, { id, kind, message }].slice(-4)
  emit()
  timers.set(id, window.setTimeout(() => dismiss(id), durationMs))
}

function dismiss(id: number) {
  const timer = timers.get(id)
  if (timer !== undefined) {
    window.clearTimeout(timer)
    timers.delete(id)
  }
  items = items.filter((t) => t.id !== id)
  emit()
}

function describeError(e: unknown): ReactNode {
  if (e instanceof ApiRequestError) {
    return (
      <>
        <strong>{e.code}</strong>
        <span> · {e.message}</span>
        {e.requestId && <span className="toast-request-id">request_id: {e.requestId}</span>}
      </>
    )
  }
  return <span>{e instanceof Error ? e.message : String(e)}</span>
}

export const toast = {
  ok: (message: ReactNode, durationMs?: number) => push('ok', message, durationMs),
  success: (message: ReactNode, durationMs?: number) => push('ok', message, durationMs),
  error: (message: ReactNode) => push('err', message, 6000),
  info: (message: ReactNode, durationMs?: number) => push('info', message, durationMs),
  /** 从 unknown 异常生成带 code/request_id 的错误 toast（useApiOperation 统一入口用）。 */
  errorFrom: (e: unknown) => push('err', describeError(e), 6000),
}

const KIND_ICONS: Record<ToastKind, ReactNode> = {
  ok: <IconCheck size={14} />,
  err: <IconAlert size={14} />,
  info: <IconInfo size={14} />,
}

/** 渲染在 shell 根部的提示栈；右下角、自动消失、可手动关闭、Esc 关闭最新一条。 */
export function ToastHost() {
  const { t } = useLang()
  const [list, setList] = useState<ToastItem[]>(items)

  useEffect(() => {
    listeners.add(setList)
    return () => {
      listeners.delete(setList)
    }
  }, [])

  useEffect(() => {
    if (list.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && items.length > 0) dismiss(items[items.length - 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [list.length])

  if (list.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {list.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`}>
          <span className="toast-icon" aria-hidden>{KIND_ICONS[item.kind]}</span>
          <div className="toast-body">{item.message}</div>
          <button type="button" className="toast-close" aria-label={t('closeToast')} onClick={() => dismiss(item.id)}>
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
