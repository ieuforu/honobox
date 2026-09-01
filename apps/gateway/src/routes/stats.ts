import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { getStats, getRequestLogs } from '../lib/request-store.js'
import type { Variables } from '../types/index.js'

const statsRoutes = new Hono<{ Variables: Variables }>()

// GET /api/stats - Overall statistics
statsRoutes.get('/', async (c) => {
  try {
    // Try database first
    const result = await db.execute(sql`
      SELECT
        COUNT(*) as total_requests,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
        COALESCE(AVG(latency_ms), 0) as avg_latency,
        COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0), 0) as error_rate
      FROM llm_requests
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `)

    const stats = result.rows[0] || {}

    const byModel = await db.execute(sql`
      SELECT
        model,
        COUNT(*) as requests,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens
      FROM llm_requests
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY model
    `)

    const byModelMap: Record<string, { requests: number; tokens: number }> = {}
    for (const row of byModel.rows) {
      byModelMap[row.model as string] = {
        requests: Number(row.requests),
        tokens: Number(row.tokens),
      }
    }

    return c.json({
      totalRequests: Number(stats.total_requests) || 0,
      totalTokens: Number(stats.total_tokens) || 0,
      avgLatencyMs: Math.round(Number(stats.avg_latency) || 0),
      errorRate: Math.round((Number(stats.error_rate) || 0) * 100) / 100,
      byModel: byModelMap,
    })
  } catch {
    // Fallback to in-memory store
    return c.json(getStats())
  }
})

// GET /api/stats/logs - Recent request logs
statsRoutes.get('/logs', async (c) => {
  try {
    const result = await db.execute(sql`
      SELECT
        id,
        trace_id as "traceId",
        request_id as "requestId",
        model,
        latency_ms as "latencyMs",
        status_code as "statusCode",
        prompt_tokens as "promptTokens",
        completion_tokens as "completionTokens",
        (prompt_tokens + completion_tokens) as "totalTokens",
        error,
        created_at as "timestamp"
      FROM llm_requests
      ORDER BY created_at DESC
      LIMIT 50
    `)

    return c.json(result.rows.map(row => ({
      ...row,
      status: row.statusCode < 400 ? 'success' : 'error',
    })))
  } catch {
    // Fallback to in-memory store
    const logs = getRequestLogs(50)
    return c.json(logs.map(log => ({
      id: log.id,
      requestId: log.requestId,
      model: log.model,
      latencyMs: log.latencyMs,
      statusCode: log.statusCode,
      promptTokens: log.promptTokens,
      completionTokens: log.completionTokens,
      totalTokens: log.promptTokens + log.completionTokens,
      error: log.error,
      timestamp: log.timestamp,
      status: log.statusCode < 400 ? 'success' : 'error',
    })))
  }
})

export { statsRoutes }
