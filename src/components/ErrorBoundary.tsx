// 全局错误边界：渲染崩溃时显示错误信息而不是白屏（可用性要求，19 §5 异常处理）。
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
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
        <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2 style={{ color: '#dc2626' }}>页面渲染出错</h2>
          <div>{String(this.state.error.message)}</div>
          <pre style={{ fontSize: 12, color: '#6b7382' }}>{this.state.error.stack}</pre>
          <button onClick={() => { this.setState({ error: null }); window.location.reload() }}>重新加载</button>
        </div>
      )
    }
    return this.props.children
  }
}
