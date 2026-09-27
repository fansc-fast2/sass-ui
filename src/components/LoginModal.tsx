// 登录弹窗：弹窗承载 LoginFlow。已有身份会话但未选租户时直接进入选租户步骤。

import { Modal } from './Modal'
import { LoginFlow } from './LoginFlow'

export function LoginModal({ onClose, startStep }: { onClose: () => void; startStep?: 'login' | 'select' }) {
  return (
    <Modal title="登录" onClose={onClose}>
      <LoginFlow onDone={onClose} startStep={startStep} />
    </Modal>
  )
}
