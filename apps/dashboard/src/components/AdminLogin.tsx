import { useEffect, useState } from 'react'
import { Eye, KeyRound, LoaderCircle } from 'lucide-react'
import { isDemoModeEnabled, setAdminToken, verifyAdminToken } from '../lib/api'

export function AdminLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [demoAvailable, setDemoAvailable] = useState(false)

  useEffect(() => {
    void isDemoModeEnabled()
      .then(setDemoAvailable)
      .catch(() => setDemoAvailable(false))
  }, [])

  const enterDemo = async () => {
    setLoading(true)
    setError('')
    try {
      if (!(await verifyAdminToken('demo'))) {
        setError('公开演示暂时不可用')
        return
      }
      setAdminToken('demo')
      onAuthenticated()
    } catch {
      setError('无法连接到 Gateway')
    } finally {
      setLoading(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (!(await verifyAdminToken(token))) {
        setError('Admin token 不正确')
        return
      }
      setAdminToken(token)
      onAuthenticated()
    } catch {
      setError('无法连接到 Gateway')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
        <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <KeyRound className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-950">HonoBox Control Plane</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          输入服务端配置的 ADMIN_TOKEN。令牌只保存在当前标签页中。
        </p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <input
            autoFocus
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Admin token"
            className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={!token || loading}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : '进入控制台'}
          </button>
        </form>
        {demoAvailable && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => void enterDemo()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-50"
            >
              <Eye className="h-4 w-4" />
              查看只读公开演示
            </button>
            <p className="mt-3 text-center text-xs text-slate-400">
              可查看指标、模型和请求日志；写操作已禁用。
            </p>
          </>
        )}
      </div>
    </main>
  )
}
