import { createMiddleware } from 'hono/factory'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Variables } from '../types'
import type { UserResponse } from '../db/schema'
import { toShanghai } from '../lib/format'

export const authMiddleware = createMiddleware<{ Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: '未授权' }, 401)
    }

    const token = authHeader.split(' ')[1]
    const userId = parseInt(token)
    if (isNaN(userId)) {
      return c.json({ error: 'Token 无效' }, 401)
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    if (!user) {
      return c.json({ error: '用户不存在' }, 401)
    }

    const formatted: UserResponse = {
      ...user,
      createdAt: toShanghai(user.createdAt),
      updatedAt: toShanghai(user.updatedAt),
    }

    c.set('userId', String(user.id))
    c.set('currentUser', formatted)
    await next()
  }
)
