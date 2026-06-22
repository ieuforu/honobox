import baseLogger from './logger'

export interface LLMRequestLog {
  traceId: string
  model: string
  latencyMs: number
  statusCode: number
  isFallback: boolean
  promptTokens?: number
  completionTokens?: number
  error?: string
}

/**
 * LLM 请求日志
 * - 正常请求 → info
 * - fallback → warn
 * - 有 error → error
 */
export function logLLMRequest(data: LLMRequestLog) {
  const { error, isFallback, ...rest } = data

  if (error) {
    baseLogger.error({ ...rest, error }, 'LLM request failed')
  } else if (isFallback) {
    baseLogger.warn(rest, 'LLM request used fallback')
  } else {
    baseLogger.info(rest, 'LLM request completed')
  }
}
