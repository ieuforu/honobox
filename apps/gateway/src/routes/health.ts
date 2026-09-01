import { Hono } from 'hono'
import { db } from '../db'

const health = new Hono()

health.get('/', async (c) => {
  try {
    await db.execute('SELECT 1')
    return c.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    })
  } catch {
    return c.json({ status: 'degraded', database: 'disconnected' }, 503)
  }
})

export default health
