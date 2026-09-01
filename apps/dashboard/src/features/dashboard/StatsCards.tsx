import { Activity, Cpu, Zap, AlertCircle } from 'lucide-react'

interface StatsCardsProps {
  stats?: {
    totalRequests: number
    totalTokens: number
    avgLatencyMs: number
    errorRate: number
  }
  isLoading: boolean
}

export function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const cards = [
    {
      label: 'Total Requests',
      value: stats?.totalRequests ?? 0,
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Total Tokens',
      value: stats?.totalTokens ?? 0,
      icon: Zap,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Avg Latency',
      value: `${stats?.avgLatencyMs ?? 0}ms`,
      icon: Cpu,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'Error Rate',
      value: `${((stats?.errorRate ?? 0) * 100).toFixed(1)}%`,
      icon: AlertCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">{card.label}</p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  {isLoading ? '...' : card.value}
                </p>
              </div>
              <div className={`rounded-lg ${card.bg} p-3`}>
                <Icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
