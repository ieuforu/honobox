import { useQuery } from '@tanstack/react-query'
import { CheckCircle, XCircle, Clock } from 'lucide-react'

interface RequestLog {
  id: string
  requestId: string
  model: string
  latencyMs: number
  statusCode: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  error: string | null
  timestamp: string
  status: string
}

export function LogsPage() {
  const { data: logs, isLoading } = useQuery<RequestLog[]>({
    queryKey: ['logs'],
    queryFn: () => fetch('/api/stats/logs').then(r => r.json()),
    refetchInterval: 3000,
  })

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Request Logs</h1>
        <p className="mt-1 text-sm text-gray-500">最近的 API 请求记录</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">加载中...</div>
        ) : logs?.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无请求记录</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-sm text-gray-500">
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3">Tokens</th>
                <th className="px-4 py-3">延迟</th>
                <th className="px-4 py-3">Request ID</th>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">错误</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log) => (
                <tr key={log.id} className="border-b border-gray-50">
                  <td className="px-4 py-3">{statusIcon(log.status)}</td>
                  <td className="px-4 py-3 font-medium">{log.model}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {log.totalTokens}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {log.latencyMs}ms
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                      {log.requestId?.slice(0, 12) ?? '-'}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-red-500">
                    {log.error ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
