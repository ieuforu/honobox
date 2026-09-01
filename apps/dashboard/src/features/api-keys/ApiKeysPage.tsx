import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight, Copy, Check } from 'lucide-react'

interface ApiKey {
  id: string
  name: string
  key: string
  rateLimit: number
  quota: number | null
  enabled: boolean
  createdAt: string
  lastUsedAt: string | null
}

export function ApiKeysPage() {
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { data: keys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ['api-keys'],
    queryFn: () => fetch('/api/api-keys').then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/api-keys/${id}/toggle`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  })

  const handleCreate = () => {
    const name = prompt('API Key 名称:')
    if (name) createMutation.mutate(name)
  }

  const handleCopy = (id: string, key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">API Keys</h1>
          <p className="mt-1 text-sm text-gray-500">管理你的 API 密钥</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          创建 Key
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">加载中...</div>
        ) : keys?.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无 API Key</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-sm text-gray-500">
                <th className="px-4 py-3">名称</th>
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">限流</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {keys?.map((key) => (
                <tr key={key.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium">{key.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-gray-100 px-2 py-1 text-xs">
                        {key.key}
                      </code>
                      <button
                        onClick={() => handleCopy(key.id, key.key)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {copiedId === key.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        key.enabled
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {key.enabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {key.rateLimit}/min
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleMutation.mutate(key.id)}
                        className="text-gray-400 hover:text-indigo-600"
                      >
                        {key.enabled ? (
                          <ToggleRight className="h-5 w-5 text-indigo-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(key.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
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
