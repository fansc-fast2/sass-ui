// 登录流（v0.2 §3）：① Identity 登录 → ② 选择成员关系 → 交换 TenantContext。
// 登录凭据只存 sessionStorage；本组件是 dev 身份适配器的前端，生产替换为
// 真实 IdP 登录（M0 Q06），选租户/交换流程不变。

import { useState } from 'react'
import { useSession } from '../session/SessionContext'
import { ROLE_LABELS } from '../session/permissions'
import { Badge, Button, Field, TextInput } from './ui'
import { IconChevronLeft } from './icons'

export function LoginFlow({ onDone, startStep }: { onDone?: () => void; startStep?: 'login' | 'select' }) {
  const { login: doLogin, selectTenant, memberships } = useSession()
  const [step, setStep] = useState<'login' | 'select'>(startStep ?? 'login')
  const [login, setLogin] = useState('frank')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [ssoHint, setSsoHint] = useState<string | null>(null)

  // 企业 SSO（生产身份，M0 Q06）：向平台取 authorize_url 后整页跳转 IdP。
  // 平台未配置 PK_OIDC_* 时（404）隐藏入口并提示。
  const startSSO = async () => {
    setError(null)
    try {
      const res = await fetch('/v1/auth/oidc/authorize?format=json')
      if (res.status === 404) {
        setSsoHint('平台未启用 SSO（未配置 PK_OIDC_*）')
        return
      }
      const env = await res.json()
      if (!env?.data?.authorize_url) throw new Error(env?.error?.message ?? 'SSO 配置缺失')
      window.location.href = env.data.authorize_url
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const submitLogin = async () => {
    setBusy(true)
    setError(null)
    try {
      const ms = await doLogin(login.trim(), password)
      setStep('select')
      void ms
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const pick = async (membershipId: string) => {
    setBusy(true)
    setError(null)
    try {
      await selectTenant(membershipId)
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-flow">
      {step === 'login' && (
        <form
          className="col gap"
          onSubmit={(e) => { e.preventDefault(); void submitLogin() }}
        >
          <p className="muted">
            身份登录（dev 适配器，种子账号 frank / frank123；生产由真实身份服务承接，M0 Q06）。
          </p>
          <div className="grid-2">
            <Field label="登录名">
              <TextInput value={login} onChange={(e) => setLogin(e.target.value)} />
            </Field>
            <Field label="密码">
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          {error && <div className="banner banner-err">{error}</div>}
          <Button type="submit" variant="primary" disabled={busy || !login.trim() || !password}>
            {busy ? '登录中…' : '登录'}
          </Button>
          <Button variant="ghost" onClick={() => void startSSO()}>企业 SSO 登录</Button>
          {ssoHint && <p className="muted">{ssoHint}</p>}
        </form>
      )}
      {step === 'select' && (
        <div className="col gap">
          <p className="muted">
            选择要进入的租户成员关系（权威目录来自平台控制面）。选择后会换取租户绑定会话。
          </p>
          {memberships.length === 0 && (
            <p className="muted">该身份还没有任何租户成员关系——请联系目标租户的管理员邀请你。</p>
          )}
          <div className="badge-wrap">
            {memberships.map((m) => (
              <Button key={m.membership_id} variant="primary" disabled={busy || m.status !== 'active'} onClick={() => void pick(m.membership_id)}>
                进入 {m.tenant_name}（{ROLE_LABELS[m.role as keyof typeof ROLE_LABELS] ?? m.role}）
              </Button>
            ))}
          </div>
          {error && <div className="banner banner-err">{error}</div>}
          <div className="row gap">
            <Button variant="ghost" onClick={() => setStep('login')}>
              <span className="btn-icon-text"><IconChevronLeft size={13} /> 重新登录</span>
            </Button>
            <Button variant="ghost" onClick={onDone}>稍后选择</Button>
          </div>
        </div>
      )}
      <p className="muted">
        会话受众隔离：identity 会话不能调用业务接口；租户会话随成员/租户状态撤销立即失效。
        {step !== 'login' && <> <Badge tone="neutral">已获取成员关系 {memberships.length} 条</Badge></>}
      </p>
    </div>
  )
}
