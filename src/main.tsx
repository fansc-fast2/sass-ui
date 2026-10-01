import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import OpsApp from './ops/OpsApp'
import { SessionProvider } from './session/SessionContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LangProvider } from './i18n'
import './styles.css'

// 双 shell 分流（v0.2 §8 D2）：/ops 为平台运营面（独立会话上下文），
// 其余为租户业务面。路由组是逻辑隔离；会话受众（aud）与服务端权限才是边界。
// LangProvider 包在两个 shell 外层：i18n 由 localStorage（pc-lang）驱动，与会话无关。
const isOps = window.location.pathname.startsWith('/ops')

const shell = isOps
  ? <OpsApp />
  : <SessionProvider><App /></SessionProvider>

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <ErrorBoundary>{shell}</ErrorBoundary>
    </LangProvider>
  </StrictMode>,
)
