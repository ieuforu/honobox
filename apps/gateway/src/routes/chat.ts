import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { logLLMRequest } from '../lib/llm-logger.js'
import { addRequestLog, getStats } from '../lib/request-store.js'
import { eventBus } from '../lib/event-bus.js'
import { db } from '../db/index.js'
import { llmRequests, models } from '../db/schema/index.js'
import { createProvider } from '../providers/index.js'
import { rateLimitMiddleware } from '../middlewares/rate-limit.js'
import type { Variables } from '../types/index.js'
import { getModelConfig } from './models.js'

const chatBodySchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    }),
  ),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
})

const chatRoutes = new Hono<{ Variables: Variables }>()

// Apply rate limiting
chatRoutes.use('/completions', rateLimitMiddleware)

// GET /v1/chat/models - List available models from database
chatRoutes.get('/models', async (c) => {
  try {
    const dbModels = await db.select().from(models).where(eq(models.enabled, true)).limit(1000)
    return c.json({
      data: dbModels.map((m) => ({
        id: m.modelId,
        object: 'model',
        created: Math.floor(new Date(m.createdAt).getTime() / 1000),
        owned_by: m.provider,
      })),
    })
  } catch (err) {
    console.error('Failed to fetch models:', err)
    return c.json({ data: [] })
  }
})

// POST /v1/chat/completions - OpenAI-compatible chat completion
chatRoutes.post('/completions', async (c) => {
  const requestId = c.get('requestId')
  const traceId = c.get('traceId')

  // Parse and validate request
  const parsed = chatBodySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json(
      {
        error: {
          message: 'Invalid request',
          type: 'invalid_request_error',
          details: parsed.error.flatten(),
        },
      },
      400,
    )
  }

  const body = parsed.data
  const start = performance.now()
  let statusCode = 200
  let promptTokens = 0
  let completionTokens = 0
  let errorMsg: string | undefined
  let finalizeInOuterScope = true
  let finalized = false

  const finalizeRequest = async () => {
    if (finalized) return
    finalized = true
    const latencyMs = Math.round(performance.now() - start)

    addRequestLog({
      id: requestId,
      traceId,
      requestId,
      model: body.model,
      latencyMs,
      statusCode,
      promptTokens,
      completionTokens,
      error: errorMsg ?? null,
      timestamp: new Date().toISOString(),
    })

    eventBus.emit('request:end', {
      id: requestId,
      requestId,
      model: body.model,
      timestamp: new Date().toISOString(),
      latencyMs,
      statusCode,
      totalTokens: promptTokens + completionTokens,
      status: statusCode < 400 ? 'success' : 'error',
    })
    eventBus.emit('stats:update', getStats())

    await db
      .insert(llmRequests)
      .values({
        traceId,
        requestId,
        model: body.model,
        latencyMs,
        statusCode,
        promptTokens,
        completionTokens,
        error: errorMsg ?? null,
      })
      .catch((err) => {
        console.error('Failed to log request:', err)
      })

    logLLMRequest({
      traceId,
      model: body.model,
      latencyMs,
      statusCode,
      isFallback: false,
      promptTokens,
      completionTokens,
      error: errorMsg,
    })
  }

  try {
    const modelConfig = await getModelConfig(body.model)
    if (!modelConfig) {
      statusCode = 404
      return c.json(
        {
          error: {
            message: `Model not found: ${body.model}`,
            type: 'invalid_request_error',
          },
        },
        404,
      )
    }

    if (!modelConfig.enabled) {
      statusCode = 400
      return c.json(
        {
          error: {
            message: `Model is disabled: ${body.model}`,
            type: 'invalid_request_error',
          },
        },
        400,
      )
    }

    const provider = createProvider(modelConfig)

    if (body.stream) {
      // The stream owns request finalization; the outer handler returns as soon
      // as the Response is created, not when the upstream stream finishes.
      finalizeInOuterScope = false
      return streamSSE(c, async (stream) => {
        const abortController = new AbortController()
        stream.onAbort(() => {
          abortController.abort()
        })

        try {
          const generator = provider.chatCompletionStream({
            model: body.model,
            messages: body.messages,
            stream: true,
            temperature: body.temperature,
            max_tokens: body.max_tokens,
            signal: abortController.signal,
          })

          for await (const chunk of generator) {
            if (stream.aborted) break
            await stream.writeSSE({ data: JSON.stringify(chunk) })
          }
          if (!stream.aborted) await stream.writeSSE({ data: '[DONE]' })
        } catch (err) {
          const aborted = abortController.signal.aborted
          statusCode = aborted ? 499 : 500
          errorMsg = aborted
            ? 'Downstream client disconnected'
            : err instanceof Error
              ? err.message
              : String(err)
          if (!stream.aborted) {
            await stream.writeSSE({
              data: JSON.stringify({
                error: { message: errorMsg, type: 'server_error' },
              }),
            })
          }
        } finally {
          await finalizeRequest()
        }
      })
    }

    // Non-streaming response
    const response = await provider.chatCompletion({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      signal: c.req.raw.signal,
    })

    promptTokens = response.usage.prompt_tokens
    completionTokens = response.usage.completion_tokens

    return c.json(response)
  } catch (err) {
    statusCode = 500
    errorMsg = err instanceof Error ? err.message : String(err)

    return c.json(
      {
        error: {
          message: errorMsg,
          type: 'server_error',
        },
      },
      500,
    )
  } finally {
    if (finalizeInOuterScope) await finalizeRequest()
  }
})

export { chatRoutes }
