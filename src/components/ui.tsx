// 轻量 UI 原语：卡片、字段、按钮、徽标、横幅、JSON 视图、空态、加载。
// 不引第三方组件库，样式集中在 styles.css。

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useState } from 'react'
import { ApiRequestError, NetworkError } from '../api/client'
import { IconCheck } from './icons'

export function Card({ title, subtitle, actions, children }: {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <em className="field-hint">{hint}</em>}
      </span>
      {children}
    </label>
  )
}

// React 19：函数组件直接接收 ref prop（无需 forwardRef）
export function TextInput({ ref, ...props }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className="input" {...props} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input textarea" {...props} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { children, ...rest } = props
  return (
    <select className="input select" {...rest}>
      {children}
    </select>
  )
}

type ButtonVariant = 'primary' | 'default' | 'danger' | 'ghost'

export function Button({ variant = 'default', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`btn btn-${variant} ${className ?? ''}`} {...rest} />
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'err' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Banner({ tone, title, children }: { tone: 'ok' | 'warn' | 'err' | 'info'; title?: string; children?: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`}>
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  )
}

/** 业务错误 → 展示 code/message/request_id；网络错误 → 专门提示。 */
export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null
  if (error instanceof ApiRequestError) {
    return (
      <Banner tone={error.status === 401 ? 'warn' : 'err'} title={`${error.code}（HTTP ${error.status}）`}>
        <div>{error.message}</div>
        <div className="muted">request_id: {error.requestId}{error.retryable ? ' · 可安全重试' : ''}</div>
        {error.status === 401 && <div>请检查右上角凭据：格式 test-cred:&lt;租户&gt;:&lt;用户&gt;:&lt;角色&gt;[:&lt;站点&gt;]</div>}
        {error.status === 403 && <div>当前角色缺少该操作权限，切换更高角色或由有权限的同事操作。</div>}
      </Banner>
    )
  }
  if (error instanceof NetworkError) {
    return <Banner tone="err" title="网络错误">{error.message}（platform-api 未启动？检查 pm2 里的 platform-api）</Banner>
  }
  if (error instanceof Error) {
    return <Banner tone="err" title="错误">{error.message}</Banner>
  }
  return <Banner tone="err" title="未知错误">{String(error)}</Banner>
}

/** 空态：说明 + 下一步动作入口（SaaS 化：空态不给裸 0，也不堆感叹号）。 */
export function EmptyState({ text, hint, action }: { text: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-text">{text}</div>
      {hint && <div className="empty-hint">{hint}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

export function Loading({ text = '加载中…' }: { text?: string }) {
  return <div className="loading">{text}</div>
}

export function JsonView({ value, label }: { value: unknown; label?: string }) {
  const [copied, setCopied] = useState(false)
  const text = JSON.stringify(value, null, 2) ?? 'null'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默
    }
  }
  return (
    <div className="jsonview">
      <div className="jsonview-head">
        {label && <span>{label}</span>}
        <button className="btn btn-ghost btn-xs" onClick={copy}>{copied ? '已复制' : '复制'}</button>
      </div>
      {/* tabIndex=0：Diff/长 JSON 区可键盘聚焦后用方向键滚动 */}
      <pre tabIndex={0}>{text}</pre>
    </div>
  )
}

export function ResultRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="result-row">
      <span className="result-label">{label}</span>
      <span className="result-value">{children}</span>
    </div>
  )
}

export function MonoText({ children }: { children: ReactNode }) {
  return <code className="mono">{children}</code>
}

/** 工作台统计卡。 */
export function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

/** 向导步骤条：已完成步骤用 SVG 对勾（不用字符符号）。 */
export function Steps({ current, labels }: { current: number; labels: string[] }) {
  return (
    <ol className="steps">
      {labels.map((label, i) => {
        const n = i + 1
        const state = n < current ? 'done' : n === current ? 'active' : 'todo'
        return (
          <li key={label} className={`step step-${state}`} aria-current={n === current ? 'step' : undefined}>
            <span className="step-dot">{n < current ? <IconCheck size={11} /> : n}</span>
            <span>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** 工作台快捷入口卡。icon 为内联 SVG（icons.tsx），不用 emoji。 */
export function ActionCard({ icon, title, desc, onClick }: {
  icon: ReactNode
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button className="action-card" onClick={onClick}>
      <span className="action-icon" aria-hidden>{icon}</span>
      <span className="action-title">{title}</span>
      <span className="action-desc">{desc}</span>
    </button>
  )
}
