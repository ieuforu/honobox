import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ToggleLeft, ToggleRight, Cpu, X } from 'lucide-react'
import { apiFetch } from '../../lib/api'

interface Model {
  id: string
  name: string
  provider: string
  modelId: string
  baseUrl: string
  apiKey: string
  maxTokens: number | null
  fallbackModelId: string | null
  enabled: boolean
  createdAt: string
}

export function ModelsPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    name: '',
    provider: 'openai',
    modelId: '',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    fallbackModelId: '',
  })

  const { data: models, isLoading } = useQuery<Model[]>({
    queryKey: ['models'],
    queryFn: () => apiFetch('/api/models').then((r) => r.json()),
  })

  const createMutation = useMutation({
    mutationFn: (data: Omit<Model, 'id' | 'createdAt'>) =>
      apiFetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] })
      setShowCreate(false)
      setForm({
        name: '',
        provider: 'openai',
        modelId: '',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        fallbackModelId: '',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/models/${id}/toggle`, { method: 'POST' }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models'] }),
  })

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault()
    createMutation.mutate({
      name: form.name,
      provider: form.provider,
      modelId: form.modelId,
      baseUrl: form.baseUrl,
      apiKey: form.apiKey,
      maxTokens: null,
      fallbackModelId: form.fallbackModelId || null,
      enabled: true,
    })
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
          onClick={() => setShowCreate(true)}
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
                <th className="px-4 py-3">故障转移</th>
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
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {model.fallbackModelId ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        → {model.fallbackModelId}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        model.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {model.enabled ? '启用' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleMutation.mutate(model.id)}
                        aria-label={model.enabled ? `禁用 ${model.name}` : `启用 ${model.name}`}
                        className="text-gray-400 hover:text-indigo-600"
                      >
                        {model.enabled ? (
                          <ToggleRight className="h-5 w-5 text-indigo-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`确定删除 ${model.name}？`)) {
                            deleteMutation.mutate(model.id)
                          }
                        }}
                        aria-label={`删除 ${model.name}`}
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

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">添加模型</h2>
                <p className="mt-1 text-sm text-gray-500">配置上游模型与可选的故障转移目标。</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="关闭"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-gray-700">
                  显示名称
                  <input
                    required
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="GPT-4o Production"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-gray-700">
                  提供商
                  <select
                    value={form.provider}
                    onChange={(event) => setForm({ ...form, provider: event.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  >
                    <option value="openai">OpenAI Compatible</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="deepseek">DeepSeek</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                模型 ID
                <input
                  required
                  value={form.modelId}
                  onChange={(event) => setForm({ ...form, modelId: event.target.value })}
                  placeholder="gpt-4o"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                Base URL
                <input
                  required
                  type="url"
                  value={form.baseUrl}
                  onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                API Key
                <input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={form.apiKey}
                  onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                  placeholder="只会加密保存，不会在页面回显"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>

              <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                备用模型
                <select
                  value={form.fallbackModelId}
                  onChange={(event) => setForm({ ...form, fallbackModelId: event.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                >
                  <option value="">不配置</option>
                  {models
                    ?.filter((model) => model.enabled && model.modelId !== form.modelId)
                    .map((model) => (
                      <option key={model.id} value={model.modelId}>
                        {model.name} · {model.modelId}
                      </option>
                    ))}
                </select>
                <span className="block text-xs font-normal text-gray-400">
                  主模型遇到限流、超时或 5xx 时，仅在首个 token 前切换。
                </span>
              </label>

              {createMutation.isError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  创建失败，请检查配置后重试。
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createMutation.isPending ? '创建中…' : '创建模型'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
