import type { MiddlewareHandler } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { rateLimits } from '../db/schema/index.js'

const WINDOW_MS = 60_000 // 1 minute
const DEFAULT_MAX_REQUESTS = 100

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.get('apiKey') ?? c.req.header('x-user-id') ?? c.req.header('cf-connecting-ip') ?? 'anonymous'
  const maxRequests = c.get('rateLimit') ?? DEFAULT_MAX_REQUESTS

  const now = Date.now()
  const windowStart = new Date(Math.floor(now / WINDOW_MS) * WINDOW_MS)

  try {
    const result = await db.execute(sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, ${windowStart.toISOString()}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limits.count + 1, updated_at = now()
      RETURNING count
    `)

    const row = result.rows[0] as { count: number } | undefined
    if (row && row.count > maxRequests) {
      c.header('Retry-After', '60')
      return c.json({
        error: {
          message: 'Rate limit exceeded',
          type: 'rate_limit_error',
          retry_after: 60,
        },
      }, 429)
    }
  } catch (err) {
    // DB failure: allow request
    console.error('[rate-limit] DB error, allowing request:', err)
  }

  await next()
}
