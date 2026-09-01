import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface UsageChartProps {
  stats?: {
    byModel: Record<string, { requests: number; tokens: number }>
  }
  isLoading: boolean
}

export function UsageChart({ stats, isLoading }: UsageChartProps) {
  const data = stats?.byModel
    ? Object.entries(stats.byModel).map(([name, value]) => ({
        name,
        requests: value.requests,
        tokens: value.tokens,
      }))
    : []

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="h-6 w-32 animate-pulse rounded bg-gray-200" />
        <div className="mt-4 h-64 animate-pulse rounded bg-gray-100" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-gray-900">Usage by Model</h3>
      <p className="mt-1 text-sm text-gray-500">Requests distribution across models</p>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="requests" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
