import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { StatsCards } from './StatsCards'
import { UsageChart } from './UsageChart'
import { RecentRequests } from './RecentRequests'
import { sseClient } from '../../lib/sse'

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
  const queryClient = useQueryClient()
  const [realtimeStats, setRealtimeStats] = useState<UsageStats | null>(null)
  const [realtimeLogs, setRealtimeLogs] = useState<RequestLog[]>([])

  const { data: stats, isLoading: statsLoading } = useQuery<UsageStats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/stats').then(r => r.json()),
  })

  const { data: logs, isLoading: logsLoading } = useQuery<RequestLog[]>({
    queryKey: ['logs'],
    queryFn: () => fetch('/api/stats/logs').then(r => r.json()),
  })

  // SSE for real-time updates
  useEffect(() => {
    sseClient.connect()

    const unsub1 = sseClient.on('stats:update', (data: UsageStats) => {
      setRealtimeStats(data)
    })

    const unsub2 = sseClient.on('request:end', (data: RequestLog) => {
      setRealtimeLogs(prev => [data, ...prev].slice(0, 50))
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['logs'] })
    })

    return () => {
      unsub1()
      unsub2()
      sseClient.disconnect()
    }
  }, [queryClient])

  // Use real-time data if available, otherwise fallback to query data
  const displayStats = realtimeStats ?? stats
  const displayLogs = realtimeLogs.length > 0 ? realtimeLogs : logs

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Monitor your AI Gateway usage and performance</p>
      </div>

      <StatsCards stats={displayStats} isLoading={statsLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UsageChart stats={displayStats} isLoading={statsLoading} />
        <RecentRequests logs={displayLogs} isLoading={logsLoading} />
      </div>
    </div>
  )
}
