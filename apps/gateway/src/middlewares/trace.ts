import { nanoid } from 'nanoid'
import type { MiddlewareHandler } from 'hono'

/**
 * Trace ID 中间件
 * - 优先读取 x-trace-id 请求头，没有则 nanoid(12) 生成
 * - 注入 c.set('traceId', ...)
 * - 响应头写回 x-trace-id
 */
export const traceMiddleware: MiddlewareHandler = async (c, next) => {
  const traceId = c.req.header('x-trace-id') ?? nanoid(12)
  c.set('traceId', traceId)
  c.set('requestId', traceId)
  await next()
  c.header('x-trace-id', traceId)
}
