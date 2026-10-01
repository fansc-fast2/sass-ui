// OIDC 回调页（/oidc-callback）：IdP 认证完成后带一次性码回到这里，
// 用码换取身份会话并刷新页面进入应用。码 120 秒单次，过期需重走 SSO。

import { useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'
import { useSession } from '../session/SessionContext'

export function OidcCallback() {
  const { completeOidcLogin } = useSession()
  const { t } = useLang()
  const [error, setError] = useState<string | null>(null)
  // 一次性码只允许消费一次：StrictMode 双执行/组件重挂载都会重跑 effect，
  // 第二次 exchange 必然 401（码已消费）——控制台报红且无意义。
  const consumed = useRef(false)

  useEffect(() => {
    if (consumed.current) return
    const oit = new URLSearchParams(window.location.search).get('oit')
    if (!oit) {
      setError(t('oidcMissingCode'))
      return
    }
    consumed.current = true
    void (async () => {
      try {
        await completeOidcLogin(oit)
        window.location.replace('/') // 会话已入 sessionStorage，整页刷新进入应用
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [completeOidcLogin, t])

  return (
    <div className="gate-screen">
      <div className="gate-brand">
        <span className="brand-mark">PK</span>
        {error
          ? <>
              <strong>{t('ssoFailedTitle')}</strong>
              <p className="muted">{error}</p>
              <a className="btn btn-primary" href="/">{t('backToLogin')}</a>
            </>
          : <p className="muted">{t('completingLogin')}</p>}
      </div>
    </div>
  )
}
