import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'
import pinoLogger from './lib/logger.js'
import { traceMiddleware } from './middlewares/trace.js'
import { authMiddleware } from './middlewares/auth.js'
import { adminAuthMiddleware } from './middlewares/admin-auth.js'
import healthRoutes from './routes/health.js'
import { chatRoutes } from './routes/chat.js'
import { apiKeyRoutes } from './routes/api-keys.js'
import { statsRoutes } from './routes/stats.js'
import { eventsRoutes } from './routes/events.js'
import { modelRoutes } from './routes/models.js'
import type { Variables } from './types/index.js'

const app = new Hono<{ Variables: Variables }>()

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

// ============ Public routes ============
app.route('/health', healthRoutes)

// ============ Data plane: gateway API keys ============
app.use('/v1/chat/*', authMiddleware)
app.route('/v1/chat', chatRoutes)

// ============ Control plane: independent admin token ============
app.use('/api/*', adminAuthMiddleware)
app.get('/api/admin/verify', (c) => c.json({ ok: true }))
app.route('/api/events', eventsRoutes)
app.route('/api/api-keys', apiKeyRoutes)
app.route('/api/models', modelRoutes)
app.route('/api/stats', statsRoutes)

// ============ 全局错误处理 ============
app.onError((err, c) => {
  pinoLogger.error({ err }, '未捕获异常')
  return c.json({ error: '服务器内部错误', message: err.message }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.url }, 404)
})

export default app
