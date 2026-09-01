import { useState } from 'react'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ApiKeysPage } from './features/api-keys/ApiKeysPage'
import { ModelsPage } from './features/models/ModelsPage'
import { LogsPage } from './features/logs/LogsPage'
import { Sidebar } from './components/layout/Sidebar'
import { Header } from './components/layout/Header'

export default function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')

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
