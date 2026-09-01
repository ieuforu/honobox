import { LayoutDashboard, Key, Cpu, ScrollText, Zap } from 'lucide-react'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'logs', label: 'Request Logs', icon: ScrollText },
]

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
        <Zap className="h-6 w-6 text-indigo-600" />
        <span className="text-lg font-semibold">AI Gateway</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-gray-200 p-4">
        <div className="text-xs text-gray-500">HonoBox v0.2.0</div>
      </div>
    </aside>
  )
}
