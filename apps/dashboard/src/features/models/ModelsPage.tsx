import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight, Cpu, CheckCircle, XCircle } from 'lucide-react'

interface Model {
  id: string
  name: string
  provider: string
  modelId: string
  baseUrl: string
  apiKey: string
  maxTokens: number | null
  enabled: boolean
  createdAt: string
}

export function ModelsPage() {
  const queryClient = useQueryClient()

  const { data: models, isLoading } = useQuery<Model[]>({
    queryKey: ['models'],
    queryFn: () => fetch('/api/models').then(r => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: (data: Omit<Model, 'id' | 'createdAt'>) =>
      fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/models/${id}/toggle`, { method: 'POST' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })

  const handleCreate = () => {
    const name = prompt('模型名称:')
    if (!name) return
    const provider = prompt('提供商 (openai/anthropic/deepseek):') as any
    if (!provider) return
    const modelId = prompt('模型 ID (如 gpt-4o):')
    if (!modelId) return
    const baseUrl = prompt('Base URL:')
    if (!baseUrl) return
    const apiKey = prompt('API Key:')
    if (!apiKey) return

    createMutation.mutate({ name, provider, modelId, baseUrl, apiKey, maxTokens: null, enabled: true })
  }

  const providerColors: Record<string, string> = {
    openai: 'bg-green-50 text-green-700',
    anthropic: 'bg-purple-50 text-purple-700',
    deepseek: 'bg-blue-50 text-blue-700',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Models</h1>
          <p className="mt-1 text-sm text-gray-500">管理可用的 AI 模型</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          添加模型
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">加载中...</div>
        ) : models?.length === 0 ? (
          <div className="p-8 text-center text-gray-400">暂无模型，点击上方按钮添加</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-sm text-gray-500">
                <th className="px-4 py-3">模型</th>
                <th className="px-4 py-3">提供商</th>
                <th className="px-4 py-3">Base URL</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {models?.map((model) => (
                <tr key={model.id} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-indigo-50 p-2">
                        <Cpu className="h-4 w-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{model.name}</p>
                        <p className="text-xs text-gray-500">{model.modelId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        providerColors[model.provider] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {model.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {model.baseUrl.length > 30 ? model.baseUrl.slice(0, 30) + '...' : model.baseUrl}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        model.enabled
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {model.enabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleMutation.mutate(model.id)}
                        className="text-gray-400 hover:text-indigo-600"
                      >
                        {model.enabled ? (
                          <ToggleRight className="h-5 w-5 text-indigo-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(model.id)}
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
