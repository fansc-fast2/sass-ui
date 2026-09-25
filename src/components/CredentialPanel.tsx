// 凭据面板：编辑/保存测试凭据（test-cred 模拟器格式），展示角色权限范围。

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useSession } from '../session/SessionContext'
import { PERM_LABELS, ROLES, ROLE_LABELS } from '../session/permissions'
import { Badge, Button, Field, Select, TextInput } from './ui'
import type { Role } from '../session/permissions'

export function CredentialPanel({ onDone }: { onDone?: () => void }) {
  const { session, save, clear } = useSession()
  const [tenant, setTenant] = useState(session?.tenant ?? 'acme')
  const [actor, setActor] = useState(session?.actor ?? 'frank')
  const [role, setRole] = useState<Role>(session?.role ?? 'publisher')
  const [sites, setSites] = useState(session?.sites.join(',') ?? '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    save({ tenant: tenant.trim(), actor: actor.trim(), role, sites: sites.split(',').map((s) => s.trim()).filter(Boolean) })
    onDone?.()
  }

  return (
    <form className="cred-form" onSubmit={submit}>
      <p className="muted">
        后端使用测试身份模拟器（M0 Q06），凭据格式 <code className="mono">test-cred:&lt;租户&gt;:&lt;用户&gt;:&lt;角色&gt;[:&lt;站点 csv&gt;]</code>。
        角色权限按 09 §1 权限矩阵阶梯叠加。
      </p>
      <div className="grid-2">
        <Field label="租户 tenant">
          <TextInput value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="acme" required />
        </Field>
        <Field label="用户 actor">
          <TextInput value={actor} onChange={(e) => setActor(e.target.value)} placeholder="frank" required />
        </Field>
        <Field label="角色 role">
          <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </Select>
        </Field>
        <Field label="站点 sites" hint="可选，逗号分隔">
          <TextInput value={sites} onChange={(e) => setSites(e.target.value)} placeholder="site-us,site-eu" />
        </Field>
      </div>
      <div className="row gap">
        <Button type="submit" variant="primary">保存凭据</Button>
        {session && (
          <Button type="button" variant="ghost" onClick={() => { clear(); onDone?.() }}>清除</Button>
        )}
      </div>
      {session && (
        <div className="scope-list">
          <span className="field-label">当前角色权限范围（{ROLE_LABELS[session.role]}）：</span>
          <div className="badge-wrap">
            {session.scopes.map((s) => (
              <Badge key={s} tone="info">{s}{PERM_LABELS[s] ? ` · ${PERM_LABELS[s]}` : ''}</Badge>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}
