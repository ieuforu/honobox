import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { chatRoutes } from '../chat'

// Mock dependencies
vi.mock('../../providers/index.js', () => ({
  getEnabledModels: () => [
    { id: 'test-model', name: 'Test', provider: 'openai', enabled: true },
  ],
  getProvider: (id: string) => ({
    chatCompletion: vi.fn().mockResolvedValue({
      id: 'test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: id,
      choices: [{ index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    chatCompletionStream: vi.fn().mockImplementation(async function* () {
      yield {
        id: 'test-id',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: id,
        choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }],
      }
    }),
  }),
}))

vi.mock('../../middlewares/rate-limit.js', () => ({
  rateLimitMiddleware: async (_c: any, next: any) => await next(),
}))

vi.mock('../../lib/request-store.js', () => ({
  addRequestLog: vi.fn(),
  getStats: vi.fn().mockReturnValue({ totalRequests: 0, totalTokens: 0, avgLatencyMs: 0, errorRate: 0, byModel: {} }),
}))

vi.mock('../../lib/event-bus.js', () => ({
  eventBus: { emit: vi.fn(), on: vi.fn() },
}))

vi.mock('../../db/index.js', () => ({
  db: { insert: () => ({ values: () => Promise.resolve() }) },
}))

vi.mock('../../db/schema/index.js', () => ({
  llmRequests: {},
}))

describe('chat routes', () => {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id')
    c.set('traceId', 'test-trace-id')
    await next()
  })
  app.route('/v1/chat', chatRoutes)

  it('GET /v1/chat/models should return models', async () => {
    const res = await app.request('/v1/chat/models')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.data).toBeInstanceOf(Array)
  })

  it('POST /v1/chat/completions should return completion', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.choices).toBeDefined()
  })

  it('POST /v1/chat/completions should validate request body', async () => {
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: true }),
    })
    expect(res.status).toBe(400)
  })
})
