// 通用弹窗：遮罩 + 居中卡片。Esc / 点击遮罩 / 关闭按钮均可关闭，
// 打开时锁定页面滚动；焦点圈闭（Tab 在弹窗内循环）、打开时聚焦第一个
// 可交互元素、关闭时恢复触发点焦点（键盘可访问性要求）。

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useLang } from '../i18n'
import { IconX } from './icons'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({
  title, onClose, children, wide,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const { t } = useLang()

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'Tab' && cardRef.current) {
        // 焦点圈闭：Tab / Shift+Tab 在弹窗内循环
        const nodes = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
          .filter((el) => el.offsetParent !== null)
        if (nodes.length === 0) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || !cardRef.current.contains(active))) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'

    // 初始聚焦：第一个可交互元素（关闭按钮兜底）
    const initial = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(initial ?? cardRef.current)?.focus()

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      opener?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={cardRef}
        className={`modal-card${wide ? ' modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="modal-close" aria-label={t('close')} onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
