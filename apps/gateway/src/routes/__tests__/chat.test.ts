import { beforeEach, describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { chatRoutes } from '../chat'
import type { Variables } from '../../types/index.js'
import { ProviderRequestError } from '../../providers/errors.js'

const mocks = vi.hoisted(() => ({
  createProvider: vi.fn(),
  getModelConfig: vi.fn(),
  addRequestLog: vi.fn(),
}))

const successfulProvider = () => ({
  chatCompletion: vi.fn().mockResolvedValue({
    id: 'test-id',
    object: 'chat.completion',
    created: Date.now(),
    model: 'test-model',
    choices: [
      { index: 0, message: { role: 'assistant', content: 'Hello' }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }),
  chatCompletionStream: vi.fn().mockImplementation(async function* () {
    yield {
      id: 'test-id',
      object: 'chat.completion.chunk',
      created: Date.now(),
      model: 'test-model',
      choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: null }],
    }
  }),
})

// Mock dependencies
vi.mock('../../providers/index.js', () => ({
  createProvider: mocks.createProvider,
}))

vi.mock('../../middlewares/rate-limit.js', () => ({
  rateLimitMiddleware: async (_c: any, next: any) => await next(),
}))

vi.mock('../models.js', () => ({
  getModelConfig: mocks.getModelConfig,
}))

vi.mock('../../lib/request-store.js', () => ({
  addRequestLog: mocks.addRequestLog,
  getStats: vi.fn().mockReturnValue({
    totalRequests: 0,
    totalTokens: 0,
    avgLatencyMs: 0,
    errorRate: 0,
    byModel: {},
  }),
}))

vi.mock('../../lib/event-bus.js', () => ({
  eventBus: { emit: vi.fn(), on: vi.fn() },
}))

vi.mock('../../db/index.js', () => ({
  db: {
    insert: () => ({ values: () => Promise.resolve() }),
    select: () => ({
      from: () => ({
        where: () => {
          const rows = [
            {
              id: '1',
              name: 'Test Model',
              provider: 'openai',
              modelId: 'test-model',
              baseUrl: 'https://api.openai.com/v1',
              apiKeyEncrypted: 'encrypted',
              maxTokens: null,
              enabled: true,
              createdAt: new Date(),
            },
          ]
          return {
            limit: () => Promise.resolve(rows),
          }
        },
      }),
    }),
  },
}))

vi.mock('../../db/schema/index.js', () => ({
  llmRequests: {},
  models: {},
}))

describe('chat routes', () => {
  const modelConfig = (id: string, fallbackModelId?: string) => ({
    id,
    name: id,
    provider: 'openai' as const,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    fallbackModelId,
    enabled: true,
  })

  const app = new Hono<{ Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request-id')
    c.set('traceId', 'test-trace-id')
    await next()
  })
  app.route('/v1/chat', chatRoutes)

  beforeEach(() => {
    mocks.createProvider.mockReset()
    mocks.createProvider.mockImplementation(() => successfulProvider())
    mocks.getModelConfig.mockReset()
    mocks.getModelConfig.mockImplementation((id: string) => Promise.resolve(modelConfig(id)))
    mocks.addRequestLog.mockReset()
  })

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

  it('falls back on a retryable upstream failure and records the served model', async () => {
    const primary = {
      ...successfulProvider(),
      chatCompletion: vi
        .fn()
        .mockRejectedValue(new ProviderRequestError('openai', 503, 'temporarily unavailable')),
    }
    const fallback = successfulProvider()
    mocks.getModelConfig.mockImplementation((id: string) =>
      Promise.resolve(id === 'primary' ? modelConfig('primary', 'backup') : modelConfig('backup')),
    )
    mocks.createProvider.mockImplementation((config) =>
      config.id === 'primary' ? primary : fallback,
    )

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'primary',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(200)
    expect(primary.chatCompletion).toHaveBeenCalledOnce()
    expect(fallback.chatCompletion).toHaveBeenCalledOnce()
    expect(mocks.addRequestLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ model: 'primary', servedModel: 'backup', isFallback: true }),
    )
  })

  it('does not fall back on a non-retryable provider error', async () => {
    const primary = {
      ...successfulProvider(),
      chatCompletion: vi
        .fn()
        .mockRejectedValue(new ProviderRequestError('openai', 401, 'invalid key')),
    }
    mocks.getModelConfig.mockImplementation((id: string) =>
      Promise.resolve(id === 'primary' ? modelConfig('primary', 'backup') : modelConfig('backup')),
    )
    mocks.createProvider.mockImplementation((config) =>
      config.id === 'primary' ? primary : successfulProvider(),
    )

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'primary',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })

    expect(res.status).toBe(502)
    expect(mocks.createProvider).toHaveBeenCalledOnce()
  })

  it('falls back only before the first streaming chunk', async () => {
    const primary = {
      ...successfulProvider(),
      chatCompletionStream: vi.fn().mockReturnValue({
        [Symbol.asyncIterator]: () => ({
          next: () =>
            Promise.reject(new ProviderRequestError('openai', 503, 'temporarily unavailable')),
        }),
      }),
    }
    const fallback = successfulProvider()
    mocks.getModelConfig.mockImplementation((id: string) =>
      Promise.resolve(id === 'primary' ? modelConfig('primary', 'backup') : modelConfig('backup')),
    )
    mocks.createProvider.mockImplementation((config) =>
      config.id === 'primary' ? primary : fallback,
    )

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'primary',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    const body = await res.text()

    expect(body).toContain('Hi')
    expect(body).toContain('[DONE]')
    expect(fallback.chatCompletionStream).toHaveBeenCalledOnce()
    expect(mocks.addRequestLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ servedModel: 'backup', isFallback: true, statusCode: 200 }),
    )
  })

  it('never mixes providers after a streaming chunk has been emitted', async () => {
    const primary = {
      ...successfulProvider(),
      chatCompletionStream: vi.fn().mockImplementation(async function* () {
        yield {
          id: 'first',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'primary',
          choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
        }
        throw new ProviderRequestError('openai', 503, 'stream interrupted')
      }),
    }
    const fallback = successfulProvider()
    mocks.getModelConfig.mockImplementation((id: string) =>
      Promise.resolve(id === 'primary' ? modelConfig('primary', 'backup') : modelConfig('backup')),
    )
    mocks.createProvider.mockImplementation((config) =>
      config.id === 'primary' ? primary : fallback,
    )

    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'primary',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    const body = await res.text()

    expect(body).toContain('partial')
    expect(body).toContain('stream interrupted')
    expect(fallback.chatCompletionStream).not.toHaveBeenCalled()
  })
})
