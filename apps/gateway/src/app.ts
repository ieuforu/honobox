import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'
import pinoLogger from './lib/logger.js'
import { traceMiddleware } from './middlewares/trace.js'
import { rpcHandler } from './orpc/handler.js'
import userRoutes from './routes/users.js'
import healthRoutes from './routes/health.js'
import { chatRoutes } from './routes/chat.js'
import { apiKeyRoutes } from './routes/api-keys.js'
import { statsRoutes } from './routes/stats.js'
import { eventsRoutes } from './routes/events.js'
import { modelRoutes } from './routes/models.js'
import type { Variables } from './types/index.js'

const app = new Hono<{ Variables: Variables }>()

// ============ oRPC 路由（全局中间件之前，避免 body stream 被消费） ============
app.all('/orpc/*', async (c) => {
  try {
    const url = new URL(c.req.url)
    url.pathname = url.pathname.replace(/^\/orpc/, '') || '/'
    const strippedReq = new Request(url.toString(), c.req.raw.clone())
    const result = await rpcHandler.handle(strippedReq)
    if (result.matched) {
      return result.response
    }
    return c.json({ error: 'Not Found' }, 404)
  } catch (err) {
    pinoLogger.error({ err }, 'oRPC handler error')
    return c.json({ error: 'oRPC error', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// ============ 全局中间件 ============
app.use('*', traceMiddleware)
app.use('*', logger())
app.use('*', cors())
app.use('*', secureHeaders())
app.use('*', timing())

app.use('*', async (c, next) => {
  const start = performance.now()
  await next()
  const ms = (performance.now() - start).toFixed(1)
  const traceId = c.get('traceId')
  pinoLogger.info(
    { traceId, method: c.req.method, path: c.req.url, status: c.res.status, ms },
    'request',
  )
})

// ============ 公开路由 ============
app.route('/health', healthRoutes)
app.route('/api/events', eventsRoutes)

// ============ API 路由（需要认证） ============
app.route('/v1/chat', chatRoutes)
app.route('/api/api-keys', apiKeyRoutes)
app.route('/api/models', modelRoutes)
app.route('/api/stats', statsRoutes)
app.route('/api/users', userRoutes)

// ============ 全局错误处理 ============
app.onError((err, c) => {
  pinoLogger.error({ err }, '未捕获异常')
  return c.json({ error: '服务器内部错误', message: err.message }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.url }, 404)
})

export default app
