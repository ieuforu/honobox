import { lazy, Suspense, useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { AdminLogin } from './components/AdminLogin'
import { sseClient } from './lib/sse'
import { clearAdminToken, getAdminToken, verifyAdminToken } from './lib/api'

const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
)
const ApiKeysPage = lazy(() =>
  import('./features/api-keys/ApiKeysPage').then((module) => ({ default: module.ApiKeysPage })),
)
const ModelsPage = lazy(() =>
  import('./features/models/ModelsPage').then((module) => ({ default: module.ModelsPage })),
)
const LogsPage = lazy(() =>
  import('./features/logs/LogsPage').then((module) => ({ default: module.LogsPage })),
)

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'unauthenticated'>(
    'checking',
  )
  const queryClient = useQueryClient()

  useEffect(() => {
    const token = getAdminToken()
    if (!token) {
      setAuthState('unauthenticated')
      return
    }
    void verifyAdminToken(token)
      .then((ok) => setAuthState(ok ? 'authenticated' : 'unauthenticated'))
      .catch(() => setAuthState('unauthenticated'))
  }, [])

  useEffect(() => {
    if (authState !== 'authenticated') return
    sseClient.connect()

    const unsub = sseClient.on('request:end', () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    })

    return () => {
      unsub()
      sseClient.disconnect()
    }
  }, [authState, queryClient])

  if (authState === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">
        Checking gateway…
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <AdminLogin onAuthenticated={() => setAuthState('authenticated')} />
  }

  const logout = () => {
    sseClient.disconnect()
    clearAdminToken()
    queryClient.clear()
    setAuthState('unauthenticated')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onLogout={logout} />
        <main className="flex-1 overflow-auto p-6">
          <Suspense fallback={<div className="text-sm text-gray-400">Loading view…</div>}>
            {currentPage === 'dashboard' && <DashboardPage />}
            {currentPage === 'api-keys' && <ApiKeysPage />}
            {currentPage === 'models' && <ModelsPage />}
            {currentPage === 'logs' && <LogsPage />}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
