// In-memory request log store (fallback when DB is unavailable)

export interface RequestLogEntry {
  id: string
  traceId: string
  requestId: string
  model: string
  latencyMs: number
  statusCode: number
  promptTokens: number
  completionTokens: number
  error: string | null
  timestamp: string
}

const requestLogs: RequestLogEntry[] = []
const MAX_LOGS = 1000

export function addRequestLog(entry: RequestLogEntry): void {
  requestLogs.unshift(entry)
  if (requestLogs.length > MAX_LOGS) {
    requestLogs.pop()
  }
}

export function getRequestLogs(limit = 50): RequestLogEntry[] {
  return requestLogs.slice(0, limit)
}

export function getStats() {
  const total = requestLogs.length
  const success = requestLogs.filter(r => r.statusCode < 400)
  const totalTokens = requestLogs.reduce((sum, r) => sum + r.promptTokens + r.completionTokens, 0)
  const avgLatency = success.length > 0
    ? Math.round(success.reduce((sum, r) => sum + r.latencyMs, 0) / success.length)
    : 0
  const errorRate = total > 0
    ? Math.round((requestLogs.filter(r => r.statusCode >= 400).length / total) * 100) / 100
    : 0

  const byModel: Record<string, { requests: number; tokens: number }> = {}
  for (const log of requestLogs) {
    byModel[log.model] = byModel[log.model] || { requests: 0, tokens: 0 }
    byModel[log.model].requests++
    byModel[log.model].tokens += log.promptTokens + log.completionTokens
  }

  return {
    totalRequests: total,
    totalTokens,
    avgLatencyMs: avgLatency,
    errorRate,
    byModel,
  }
}
