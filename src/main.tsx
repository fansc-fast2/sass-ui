import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SessionProvider } from './session/SessionContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SessionProvider>
        <App />
      </SessionProvider>
    </ErrorBoundary>
  </StrictMode>,
)
