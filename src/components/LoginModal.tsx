// 登录弹窗：弹窗承载 LoginFlow。已有身份会话但未选租户时直接进入选租户步骤。

import { useLang } from '../i18n'
import { Modal } from './Modal'
import { LoginFlow } from './LoginFlow'

export function LoginModal({ onClose, startStep }: { onClose: () => void; startStep?: 'login' | 'select' }) {
  const { t } = useLang()
  return (
    <Modal title={t('loginTitle')} onClose={onClose}>
      <LoginFlow onDone={onClose} startStep={startStep} />
    </Modal>
  )
}
