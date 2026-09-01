import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ApiKeysPage } from './features/api-keys/ApiKeysPage'
import { ModelsPage } from './features/models/ModelsPage'
import { LogsPage } from './features/logs/LogsPage'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'
import { sseClient } from './lib/sse'

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const queryClient = useQueryClient()

  // Global SSE connection - only once
  useEffect(() => {
    sseClient.connect()

    const unsub = sseClient.on('request:end', () => {
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    })

    return () => {
      unsub()
      // Don't disconnect SSE on page change
    }
  }, [queryClient])

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">
          {currentPage === 'dashboard' && <DashboardPage />}
          {currentPage === 'api-keys' && <ApiKeysPage />}
          {currentPage === 'models' && <ModelsPage />}
          {currentPage === 'logs' && <LogsPage />}
        </main>
      </div>
    </div>
  )
}
