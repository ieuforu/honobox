import { useQuery } from '@tanstack/react-query'
import { StatsCards } from './StatsCards.tsx'
import { UsageChart } from './UsageChart.tsx'
import { RecentRequests } from './RecentRequests.tsx'

interface UsageStats {
  totalRequests: number
  totalTokens: number
  avgLatencyMs: number
  errorRate: number
  byModel: Record<string, { requests: number; tokens: number }>
}

interface RequestLog {
  id: string
  requestId: string
  model: string
  latencyMs: number
  statusCode: number
  totalTokens: number
  error: string | null
  timestamp: string
  status: string
}

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<UsageStats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then(r => r.json()),
    refetchInterval: 3000,
  })

  const { data: logs, isLoading: logsLoading } = useQuery<RequestLog[]>({
    queryKey: ['logs'],
    queryFn: () => fetch('/api/stats/logs').then(r => r.json()),
    refetchInterval: 3000,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Monitor your AI Gateway usage and performance</p>
      </div>

      <StatsCards stats={stats} isLoading={statsLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UsageChart stats={stats} isLoading={statsLoading} />
        <RecentRequests logs={logs} isLoading={logsLoading} />
      </div>
    </div>
  )
}
