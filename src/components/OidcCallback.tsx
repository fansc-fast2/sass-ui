// OIDC 回调页（/oidc-callback）：IdP 认证完成后带一次性码回到这里，
// 用码换取身份会话并刷新页面进入应用。码 120 秒单次，过期需重走 SSO。

import { useEffect, useState } from 'react'
import { useSession } from '../session/SessionContext'

export function OidcCallback() {
  const { completeOidcLogin } = useSession()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const oit = new URLSearchParams(window.location.search).get('oit')
    if (!oit) {
      setError('回调缺少一次性码（oit）')
      return
    }
    void (async () => {
      try {
        await completeOidcLogin(oit)
        window.location.replace('/') // 会话已入 sessionStorage，整页刷新进入应用
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [completeOidcLogin])

  return (
    <div className="gate-screen">
      <div className="gate-brand">
        <span className="brand-mark">PK</span>
        {error
          ? <>
              <strong>SSO 登录失败</strong>
              <p className="muted">{error}</p>
              <a className="btn btn-primary" href="/">返回登录</a>
            </>
          : <p className="muted">正在完成登录…</p>}
      </div>
    </div>
  )
}
