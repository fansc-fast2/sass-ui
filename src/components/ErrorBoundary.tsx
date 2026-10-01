// 全局错误边界：渲染崩溃时显示错误信息而不是白屏（可用性要求，19 §5 异常处理）。
// 文案经 useLang 双语化；fallback 是函数组件（位于 LangProvider 内层）。
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useLang } from '../i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

function BoundaryFallback({ error, onReload }: { error: Error; onReload: () => void }) {
  const { t } = useLang()
  return (
    <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
      <h2 style={{ color: '#dc2626' }}>{t('boundaryTitle')}</h2>
      <div>{String(error.message)}</div>
      <pre style={{ fontSize: 12, color: '#6b7382' }}>{error.stack}</pre>
      <button onClick={onReload}>{t('boundaryRetry')}</button>
    </div>
  )
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留组件栈便于定位（开发期）
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <BoundaryFallback
          error={this.state.error}
          onReload={() => { this.setState({ error: null }); window.location.reload() }}
        />
      )
    }
    return this.props.children
  }
}
