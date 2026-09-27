// 登录弹窗：弹窗承载 LoginFlow。

import { Modal } from './Modal'
import { LoginFlow } from './LoginFlow'

export function LoginModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="登录" onClose={onClose}>
      <LoginFlow onDone={onClose} />
    </Modal>
  )
}
