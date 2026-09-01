import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { apiKeys } from '../db/schema/index.js'
import type { Variables } from '../types/index.js'

const apiKeyRoutes = new Hono<{ Variables: Variables }>()

// GET /api/api-keys
apiKeyRoutes.get('/', async (c) => {
  try {
    const keys = await db.select().from(apiKeys)
    return c.json(keys.map(k => ({
      ...k,
      key: k.key.slice(0, 10) + '...',
    })))
  } catch (err) {
    console.error('Failed to fetch API keys:', err)
    return c.json([])
  }
})

// POST /api/api-keys
const createKeySchema = z.object({
  name: z.string().min(1),
  rateLimit: z.number().positive().default(100),
  quota: z.number().positive().nullable().default(null),
})

apiKeyRoutes.post('/', async (c) => {
  const parsed = createKeySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
  }

  try {
    const newKey = {
      name: parsed.data.name,
      key: `sk-${nanoid(32)}`,
      rateLimit: parsed.data.rateLimit,
      quota: parsed.data.quota,
    }

    const result = await db.insert(apiKeys).values(newKey).returning()
    return c.json(result[0], 201)
  } catch (err) {
    console.error('Failed to create API key:', err)
    return c.json({ error: 'Failed to create API key' }, 500)
  }
})

// DELETE /api/api-keys/:id
apiKeyRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await db.delete(apiKeys).where(eq(apiKeys.id, id))
    return c.json({ success: true })
  } catch (err) {
    console.error('Failed to delete API key:', err)
    return c.json({ error: 'Failed to delete API key' }, 500)
  }
})

// POST /api/api-keys/:id/toggle
apiKeyRoutes.post('/:id/toggle', async (c) => {
  const id = c.req.param('id')
  try {
    const key = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1)
    if (!key[0]) {
      return c.json({ error: 'API key not found' }, 404)
    }

    const result = await db
      .update(apiKeys)
      .set({ enabled: !key[0].enabled })
      .where(eq(apiKeys.id, id))
      .returning()

    return c.json(result[0])
  } catch (err) {
    console.error('Failed to toggle API key:', err)
    return c.json({ error: 'Failed to toggle API key' }, 500)
  }
})

export { apiKeyRoutes }
