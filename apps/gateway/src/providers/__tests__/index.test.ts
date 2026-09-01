import { describe, it, expect } from 'vitest'
import {
  getModel,
  getEnabledModels,
  addModel,
  removeModel,
  createProvider,
  type ModelConfig,
} from '../index'

describe('providers', () => {
  describe('getModel', () => {
    it('should return model by id', () => {
      const model = getModel('mimo-v2.5-pro')
      expect(model).toBeDefined()
      expect(model?.id).toBe('mimo-v2.5-pro')
    })

    it('should return undefined for unknown model', () => {
      const model = getModel('unknown-model')
      expect(model).toBeUndefined()
    })
  })

  describe('getEnabledModels', () => {
    it('should return only enabled models', () => {
      const models = getEnabledModels()
      models.forEach(m => {
        expect(m.enabled).toBe(true)
      })
    })
  })

  describe('addModel / removeModel', () => {
    it('should add and remove a model', () => {
      const testModel: ModelConfig = {
        id: 'test-model',
        name: 'Test Model',
        provider: 'openai',
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        enabled: true,
      }

      addModel(testModel)
      expect(getModel('test-model')).toBeDefined()

      removeModel('test-model')
      expect(getModel('test-model')).toBeUndefined()
    })
  })

  describe('createProvider', () => {
    it('should create OpenAI provider', () => {
      const model = getModel('gpt-4o')
      if (model) {
        const provider = createProvider(model)
        expect(provider.chatCompletion).toBeDefined()
        expect(provider.chatCompletionStream).toBeDefined()
      }
    })

    it('should throw for unsupported provider', () => {
      const model: ModelConfig = {
        id: 'test',
        name: 'Test',
        provider: 'unsupported' as any,
        baseUrl: 'https://test.com',
        apiKey: 'key',
        enabled: true,
      }
      expect(() => createProvider(model)).toThrow()
    })
  })
})
