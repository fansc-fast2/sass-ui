// 登录弹窗：遮罩 + 居中卡片承载 LoginFlow，不嵌入页面信息流。
// Esc / 点击遮罩 / 关闭按钮均可关闭。

import { useEffect } from 'react'
import { LoginFlow } from './LoginFlow'

export function LoginModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal-card modal-login"
        role="dialog"
        aria-modal="true"
        aria-label="登录"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <strong>登录</strong>
          <button className="modal-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <LoginFlow onDone={onClose} />
        </div>
      </div>
    </div>
  )
}
