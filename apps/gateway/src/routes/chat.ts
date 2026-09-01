import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { getProvider, getEnabledModels } from '../providers/index.js'
import { logLLMRequest } from '../lib/llm-logger.js'
import { addRequestLog } from '../lib/request-store.js'
import { db } from '../db/index.js'
import { llmRequests } from '../db/schema/index.js'
import { rateLimitMiddleware } from '../middlewares/rate-limit.js'
import type { Variables } from '../types/index.js'

const chatBodySchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
})

const chatRoutes = new Hono<{ Variables: Variables }>()

// Apply rate limiting
chatRoutes.use('/completions', rateLimitMiddleware)

// GET /v1/chat/models - List available models
chatRoutes.get('/models', (c) => {
  const models = getEnabledModels().map(m => ({
    id: m.id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: m.provider,
  }))
  return c.json({ data: models })
})

// POST /v1/chat/completions - OpenAI-compatible chat completion
chatRoutes.post('/completions', async (c) => {
  const requestId = c.get('requestId')
  const traceId = c.get('traceId')

  // Parse and validate request
  const parsed = chatBodySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({
      error: {
        message: 'Invalid request',
        type: 'invalid_request_error',
        details: parsed.error.flatten(),
      },
    }, 400)
  }

  const body = parsed.data
  const start = performance.now()
  let statusCode = 200
  let promptTokens = 0
  let completionTokens = 0
  let errorMsg: string | undefined

  try {
    const provider = getProvider(body.model)

    if (body.stream) {
      // Streaming response
      return streamSSE(c, async (stream) => {
        stream.onAbort(() => {
          console.log('Client disconnected')
        })

        try {
          const generator = provider.chatCompletionStream({
            model: body.model,
            messages: body.messages,
            stream: true,
            temperature: body.temperature,
            max_tokens: body.max_tokens,
          })

          for await (const chunk of generator) {
            if (stream.aborted) break
            await stream.writeSSE({ data: JSON.stringify(chunk) })
          }
        } catch (err) {
          statusCode = 500
          errorMsg = err instanceof Error ? err.message : String(err)
          await stream.writeSSE({
            data: JSON.stringify({
              error: { message: errorMsg, type: 'server_error' },
            }),
          })
        } finally {
          const latencyMs = Math.round(performance.now() - start)
          logLLMRequest({
            traceId,
            requestId,
            model: body.model,
            latencyMs,
            statusCode,
            promptTokens,
            completionTokens,
            error: errorMsg,
          })
        }
      })
    }

    // Non-streaming response
    const response = await provider.chatCompletion({
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
    })

    promptTokens = response.usage.prompt_tokens
    completionTokens = response.usage.completion_tokens

    return c.json(response)

  } catch (err) {
    statusCode = 500
    errorMsg = err instanceof Error ? err.message : String(err)

    return c.json({
      error: {
        message: errorMsg,
        type: 'server_error',
      },
    }, 500)
  } finally {
    const latencyMs = Math.round(performance.now() - start)

    // Log to in-memory store
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

    // Log to database (async, don't block response)
    db.insert(llmRequests)
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
  }
})

export { chatRoutes }
