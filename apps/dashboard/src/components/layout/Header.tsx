import { LogOut, Server } from 'lucide-react'

export function Header({ onLogout }: { onLogout: () => void }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div className="flex items-center gap-3 text-sm text-gray-600">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
          <Server className="h-4 w-4" />
        </span>
        <div>
          <p className="font-medium text-gray-900">Control plane</p>
          <p className="text-xs text-gray-400">Authenticated session</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Connected
        </span>
        <button
          onClick={onLogout}
          title="退出控制台"
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
