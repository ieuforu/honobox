import { describe, it, expectTypeOf } from 'vitest'
import type {
  ModelConfig,
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ApiKey,
  UsageStats,
  RequestLog,
} from '../index'

describe('shared types', () => {
  it('ModelConfig should have required fields', () => {
    expectTypeOf<ModelConfig>().toHaveProperty('id')
    expectTypeOf<ModelConfig>().toHaveProperty('name')
    expectTypeOf<ModelConfig>().toHaveProperty('provider')
    expectTypeOf<ModelConfig>().toHaveProperty('baseUrl')
    expectTypeOf<ModelConfig>().toHaveProperty('apiKey')
    expectTypeOf<ModelConfig>().toHaveProperty('enabled')
  })

  it('ChatCompletionRequest should have messages array', () => {
    expectTypeOf<ChatCompletionRequest>().toHaveProperty('model')
    expectTypeOf<ChatCompletionRequest>().toHaveProperty('messages')
  })

  it('UsageStats should have byModel record', () => {
    expectTypeOf<UsageStats>().toHaveProperty('totalRequests')
    expectTypeOf<UsageStats>().toHaveProperty('byModel')
  })
})
