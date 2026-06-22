import type { MiddlewareHandler } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from '../db'

const WINDOW_MS = 60_000 // 1 分钟
const MAX_REQUESTS = 10

/**
 * 滑动窗口限流中间件
 * - key: x-user-id → cf-connecting-ip → 'anonymous'
 * - 窗口: 1 分钟
 * - 上限: 10 次
 * - 超限: 429 + Retry-After: 60
 */
export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('x-user-id') ?? c.req.header('cf-connecting-ip') ?? 'anonymous'

  const now = Date.now()
  const windowStart = new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS)

  try {
    const result = await db.execute<{ count: number }>(sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, ${windowStart.toISOString()}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limits.count + 1, updated_at = now()
      RETURNING count
    `)

    const row = result.rows[0]
    if (row && row.count > MAX_REQUESTS) {
      c.header('Retry-After', '60')
      return c.json({ error: '请求过于频繁，请稍后再试', retryAfter: 60 }, 429)
    }
  } catch (err) {
    // DB 故障时放行
    console.error('[rate-limit] DB error, allowing request:', err)
  }

  await next()
}
