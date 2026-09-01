import { useQuery } from '@tanstack/react-query'
import { Cpu, CheckCircle, XCircle } from 'lucide-react'

interface Model {
  id: string
  object: string
  created: number
  owned_by: string
}

export function ModelsPage() {
  const { data, isLoading } = useQuery<{ data: Model[] }>({
    queryKey: ['models'],
    queryFn: () => fetch('/v1/chat/models').then(r => r.json()),
    refetchInterval: 10000,
  })

  const models = data?.data ?? []

  const providerColors: Record<string, string> = {
    openai: 'bg-green-50 text-green-700',
    anthropic: 'bg-purple-50 text-purple-700',
    deepseek: 'bg-blue-50 text-blue-700',
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Models</h1>
        <p className="mt-1 text-sm text-gray-500">可用的 AI 模型</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : models.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
          暂无可用模型，请配置 API Key
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <div
              key={model.id}
              className="rounded-xl border border-gray-200 bg-white p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-50 p-2">
                    <Cpu className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{model.id}</h3>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        providerColors[model.owned_by] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {model.owned_by}
                    </span>
                  </div>
                </div>
                <CheckCircle className="h-5 w-5 text-green-500" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
