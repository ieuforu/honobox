import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { callDify } from '../lib/dify'
import { logLLMRequest } from '../lib/llm-logger'
import { db } from '../db'
import { llmRequests } from '../db/schema'
import { rateLimitMiddleware } from '../middlewares/rate-limit'
import type { Variables } from '../types'

const chatBodySchema = z.object({
  query: z.string().min(1, 'query 不能为空'),
  conversation_id: z.string().optional(),
})

const chatRoutes = new Hono<{ Variables: Variables }>()

/**
 * POST /api/chat/stream
 * SSE 流式代理 Dify Chat API
 * traceMiddleware (global) → rateLimitMiddleware → handler
 */
chatRoutes.use('/stream', rateLimitMiddleware)
chatRoutes.post('/stream', async (c) => {
  const traceId = c.get('traceId')

  // 1. 校验 body
  const parsed = chatBodySchema.safeParse(await c.req.json())
  if (!parsed.success) {
    return c.json({ error: '参数校验失败', details: parsed.error.flatten() }, 400)
  }

  const { query, conversation_id } = parsed.data
  const start = performance.now()
  let statusCode = 200
  let isFallback = false
  let promptTokens: number | undefined
  let completionTokens: number | undefined
  let errorMsg: string | undefined
  let model = 'dify-default'

  return streamSSE(c, async (stream) => {
    // 监听客户端断开
    stream.onAbort(() => {
      // 客户端断开，stream 内部循环会自动退出
    })

    try {
      const generator = callDify(
        {
          query,
          conversation_id,
          user: 'gateway',
          response_mode: 'streaming',
        },
        c.req.raw.signal,
      )

      let conversationId = conversation_id

      for await (const event of generator) {
        // 检查流是否已关闭
        if (stream.aborted) break

        if (event.event === 'message' && event.answer !== undefined) {
          // 流式文本 chunk
          await stream.writeSSE({
            event: 'message',
            data: JSON.stringify({
              type: 'chunk',
              content: event.answer,
              conversation_id: event.conversation_id,
            }),
          })
          if (event.conversation_id) {
            conversationId = event.conversation_id
          }
        } else if (event.event === 'message_end') {
          // 流结束，提取 token 用量
          if (event.metadata?.usage) {
            promptTokens = event.metadata.usage.prompt_tokens
            completionTokens = event.metadata.usage.completion_tokens
          }
          await stream.writeSSE({
            event: 'message',
            data: JSON.stringify({
              type: 'done',
              conversation_id: conversationId,
              message_id: event.message_id,
            }),
          })
        } else if (event.event === 'error') {
          statusCode = 502
          errorMsg = String(event.message ?? 'Dify stream error')
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ type: 'error', message: errorMsg }),
          })
          break
        }
      }
    } catch (err) {
      statusCode = 502
      errorMsg = err instanceof Error ? err.message : String(err)
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ type: 'error', message: errorMsg }),
      })
    } finally {
      const latencyMs = Math.round(performance.now() - start)

      // 结构化日志
      logLLMRequest({
        traceId,
        model,
        latencyMs,
        statusCode,
        isFallback,
        promptTokens,
        completionTokens,
        error: errorMsg,
      })

      // 持久化到 DB（异步，不阻塞响应）
      db.insert(llmRequests)
        .values({
          traceId,
          model,
          latencyMs,
          statusCode,
          isFallback,
          promptTokens,
          completionTokens,
          error: errorMsg ?? null,
        })
        .catch((err) => {
          // DB 写入失败只记日志，不影响用户
          logLLMRequest({
            traceId,
            model: 'system',
            latencyMs: 0,
            statusCode: 500,
            isFallback: false,
            error: `Failed to persist LLM request: ${err instanceof Error ? err.message : String(err)}`,
          })
        })
    }
  })
})

export default chatRoutes
