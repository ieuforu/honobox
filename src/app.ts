import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { timing } from 'hono/timing'
import pinoLogger from './lib/logger'
import { traceMiddleware } from './middlewares/trace'
import userRoutes from './routes/users'
import healthRoutes from './routes/health'
import chatRoutes from './routes/chat'
import type { Variables } from './types'

// app.ts — 组装全局中间件 + 挂载路由，不包含启动逻辑
const app = new Hono<{ Variables: Variables }>()

// ============ 全局中间件 ============
app.use('*', traceMiddleware) // 全链路 traceId（最先执行）
app.use('*', logger()) // 请求日志（Hono 内置）
app.use('*', cors()) // 跨域
app.use('*', secureHeaders()) // 安全响应头
app.use('*', timing()) // Server-Timing

// 自定义 Pino 日志中间件
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

// ============ 路由挂载 ============
app.route('/api/health', healthRoutes)
app.route('/api/users', userRoutes)
app.route('/api/chat', chatRoutes)

// ============ 全局错误处理 ============
app.onError((err, c) => {
  pinoLogger.error({ err }, '未捕获异常')
  return c.json({ error: '服务器内部错误', message: err.message }, 500)
})

// ============ 404 ============
app.notFound((c) => {
  return c.json({ error: 'Not Found', path: c.req.url }, 404)
})

export default app
