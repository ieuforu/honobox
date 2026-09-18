import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { config } from '../config/index.js'

function equalSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export const adminAuthMiddleware: MiddlewareHandler = async (c, next) => {
  if (!config.auth.adminToken) {
    return c.json({ error: 'ADMIN_TOKEN is not configured' }, 503)
  }

  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token || !equalSecret(token, config.auth.adminToken)) {
    return c.json({ error: 'Invalid admin token' }, 401)
  }

  await next()
}
