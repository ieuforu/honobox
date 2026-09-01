import { Hono } from 'hono'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { models } from '../db/schema/index.js'
import { createProvider } from '../providers/index.js'
import type { ModelConfig, ModelProviderInterface } from '@ai-gateway/shared'
import type { Variables } from '../types/index.js'

const modelRoutes = new Hono<{ Variables: Variables }>()

// GET /api/models - List all models
modelRoutes.get('/', async (c) => {
  try {
    const allModels = await db.select().from(models)
    return c.json(allModels.map(m => ({
      ...m,
      apiKey: m.apiKey.slice(0, 10) + '...',
    })))
  } catch (err) {
    console.error('Failed to fetch models:', err)
    return c.json([])
  }
})

// POST /api/models - Create model
const createModelSchema = z.object({
  name: z.string().min(1),
  provider: z.enum(['openai', 'anthropic', 'deepseek']),
  modelId: z.string().min(1),
  baseUrl: z.string().url(),
  apiKey: z.string().min(1),
  maxTokens: z.number().positive().nullable().default(null),
})

modelRoutes.post('/', async (c) => {
  const parsed = createModelSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400)
  }

  try {
    const result = await db.insert(models).values(parsed.data).returning()
    return c.json(result[0], 201)
  } catch (err) {
    console.error('Failed to create model:', err)
    return c.json({ error: 'Failed to create model' }, 500)
  }
})

// DELETE /api/models/:id
modelRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await db.delete(models).where(eq(models.id, id))
    return c.json({ success: true })
  } catch (err) {
    console.error('Failed to delete model:', err)
    return c.json({ error: 'Failed to delete model' }, 500)
  }
})

// POST /api/models/:id/toggle
modelRoutes.post('/:id/toggle', async (c) => {
  const id = c.req.param('id')
  try {
    const model = await db.select().from(models).where(eq(models.id, id)).limit(1)
    if (!model[0]) {
      return c.json({ error: 'Model not found' }, 404)
    }

    const result = await db
      .update(models)
      .set({ enabled: !model[0].enabled })
      .where(eq(models.id, id))
      .returning()

    return c.json(result[0])
  } catch (err) {
    console.error('Failed to toggle model:', err)
    return c.json({ error: 'Failed to toggle model' }, 500)
  }
})

// Helper: Get model config for provider
export async function getModelConfig(modelId: string): Promise<ModelConfig | null> {
  const result = await db.select().from(models).where(eq(models.modelId, modelId)).limit(1)
  return result[0] ?? null
}

// Helper: Get provider for model
export async function getProviderForModel(modelId: string): Promise<ModelProviderInterface | null> {
  const config = await getModelConfig(modelId)
  if (!config || !config.enabled) return null

  return createProvider({
    id: config.modelId,
    name: config.name,
    provider: config.provider as any,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    maxTokens: config.maxTokens ?? undefined,
    enabled: config.enabled,
  })
}

export { modelRoutes }
