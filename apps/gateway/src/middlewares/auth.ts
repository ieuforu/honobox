import type { MiddlewareHandler } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { apiKeys } from '../db/schema/index.js'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  try {
    // Look up the API key in database
    const keys = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key, token))
      .limit(1)

    const key = keys[0]

    if (!key) {
      return c.json({ error: 'Invalid API key' }, 401)
    }

    if (!key.enabled) {
      return c.json({ error: 'API key is disabled' }, 403)
    }

    // Update last used timestamp
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))

    // Store key info in context
    c.set('apiKey', key.key)
    c.set('apiKeyId', key.id)
    c.set('rateLimit', key.rateLimit)

    await next()
  } catch (err) {
    console.error('Auth error:', err)
    return c.json({ error: 'Authentication failed' }, 500)
  }
}
