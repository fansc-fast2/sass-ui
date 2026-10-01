// 登录流（v0.2 §3）：① Identity 登录 → ② 选择成员关系 → 交换 TenantContext。
// 登录凭据只存 sessionStorage；本组件是 dev 身份适配器的前端，生产替换为
// 真实 IdP 登录（M0 Q06），选租户/交换流程不变。

import { useState } from 'react'
import { useLang } from '../i18n'
import { roleLabel } from '../session/permissions'
import { useSession } from '../session/SessionContext'
import { Badge, Button, Field, TextInput } from './ui'
import { IconChevronLeft } from './icons'

export function LoginFlow({ onDone, startStep }: { onDone?: () => void; startStep?: 'login' | 'select' }) {
  const { login: doLogin, selectTenant, memberships } = useSession()
  const { t } = useLang()
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
        setSsoHint(t('ssoNotEnabled'))
        return
      }
      const env = await res.json()
      if (!env?.data?.authorize_url) throw new Error(env?.error?.message ?? 'SSO config missing')
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
            {t('devAdapterNote')}
          </p>
          <div className="grid-2">
            <Field label={t('fieldLoginName')}>
              <TextInput value={login} onChange={(e) => setLogin(e.target.value)} />
            </Field>
            <Field label={t('fieldPassword')}>
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
          {error && <div className="banner banner-err">{error}</div>}
          <Button type="submit" variant="primary" disabled={busy || !login.trim() || !password}>
            {busy ? t('loggingIn') : t('login')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void startSSO()}>{t('btnSsoLogin')}</Button>
          {ssoHint && <p className="muted">{ssoHint}</p>}
        </form>
      )}
      {step === 'select' && (
        <div className="col gap">
          <p className="muted">
            {t('selectTenantNote')}
          </p>
          {memberships.length === 0 && (
            <p className="muted">{t('noMemberships')}</p>
          )}
          <div className="badge-wrap">
            {memberships.map((m) => (
              <Button key={m.membership_id} variant="primary" disabled={busy || m.status !== 'active'} onClick={() => void pick(m.membership_id)}>
                {t('enterTenant', { tenant: m.tenant_name, role: roleLabel(t, m.role) })}
              </Button>
            ))}
          </div>
          {error && <div className="banner banner-err">{error}</div>}
          <div className="row gap">
            <Button variant="ghost" onClick={() => setStep('login')}>
              <span className="btn-icon-text"><IconChevronLeft size={13} /> {t('relogin')}</span>
            </Button>
            <Button variant="ghost" onClick={onDone}>{t('chooseLater')}</Button>
          </div>
        </div>
      )}
      <p className="muted">
        {t('sessionAudienceNote')}
        {step !== 'login' && <> <Badge tone="neutral">{t('membershipsFetched', { count: memberships.length })}</Badge></>}
      </p>
    </div>
  )
}
