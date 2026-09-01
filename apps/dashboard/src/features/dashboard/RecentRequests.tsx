import { CheckCircle, XCircle, Clock } from 'lucide-react'

interface RecentRequestsProps {
  logs?: Array<{
    id: string
    model: string
    totalTokens: number
    latencyMs: number
    statusCode: number
    timestamp: string
    status: string
  }>
  isLoading: boolean
}

export function RecentRequests({ logs, isLoading }: RecentRequestsProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-gray-100" />
          ))}
        </div>
      </div>
    )
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900">Recent Requests</h3>
      <p className="mt-1 text-sm text-gray-500">Latest API calls</p>

      <div className="mt-4 space-y-3">
        {logs?.slice(0, 5).map((log) => (
          <div
            key={log.id}
            className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
          >
            <div className="flex items-center gap-3">
              {statusIcon(log.status)}
              <div>
                <p className="text-sm font-medium text-gray-900">{log.model}</p>
                <p className="text-xs text-gray-500">
                  {log.totalTokens} tokens · {log.latencyMs}ms
                </p>
              </div>
            </div>
            <span className="text-xs text-gray-400">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {(!logs || logs.length === 0) && (
          <p className="py-8 text-center text-sm text-gray-400">No requests yet</p>
        )}
      </div>
    </div>
  )
}
